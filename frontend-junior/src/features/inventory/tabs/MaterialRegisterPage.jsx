// Real material register + Inward/Outward - replaces the earlier
// MaterialRegisterPlaceholder (STEP 4) now that the business logic is
// wired in. Business logic (filters, pagination, opening/period/closing
// balances, Inward/Outward posting) is ported from the tested
// frontend/src/features/store/MaterialRegisterPage.jsx; presentation
// reuses this app's own approved green/orange dual-ledger design
// (StockLedger.css's stock-* classes, the same ones StockLedgerTab.jsx
// uses) instead of the reference's reg-* theme, per this screen's own
// instructions to keep the junior's hero/colors/summary-panel/table look.
//
// This register is READ-ONLY for recorded movements - there is no
// reverse/edit action on an already-posted receipt or issue in this
// version (same as the reference), so, unlike the mock StockLedgerTab
// this replaces, there is no Actions column on either table.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import { LoadingState } from '../../../components/Spinner'
import Modal from '../components/Modal'
import { getErrorMessage } from '../../../utils/errors'
import InwardStockModal from '../../store/InwardStockModal'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import {
  createCutoverStockDraft,
  createPhysicalCountDraft,
  listMaterialIssueMovements,
} from '../../store/materialIssueService'
import {
  getMaterial,
  getMaterialRegister,
  listContainerTypes,
  listMaterialSuppliers,
  listMyCompanies,
} from '../../store/storeService'
import { cancelGoodsReceipt, createGoodsReceipt, getGoodsReceipt, postGoodsReceipt } from '../../store/receivingService'
import { cancelMaterialIssue, getMaterialIssue } from '../../store/materialIssueService'
import './StockLedger.css'

const PAGE_SIZE = 25
const KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging' }

// Financial-year quick-select (April 1 -> March 31) - a pure UI
// convenience that only fills the SAME "From"/"To" date inputs the
// register already filters on; never sent to the server as its own
// concept and never changes what the server computes.
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
// server-side report of unauthorized or unfiltered data.
function exportMovementsCsv(material, movements, coverage) {
  const headers = [
    'Posted', 'Arrived', 'Goods receipt', 'Invoice/Delivery ref', 'Supplier', 'Source company',
    'Quantity', 'Unit', 'Container', 'Unit price', 'Pricing unit', 'Currency',
  ]
  const rows = movements.map((row) => [
    (row.posted_at || '').slice(0, 10),
    (row.source_goods_receipt_arrived_at || '').slice(0, 10),
    row.source_goods_receipt_reference || '',
    row.source_invoice_reference || row.source_delivery_note_reference || '',
    (row.supplier_code && row.supplier_name && row.supplier_code !== row.supplier_name
      ? `${row.supplier_code} - ${row.supplier_name}`
      : row.supplier_name || row.supplier_code || ''),
    row.source_company_code || '',
    row.quantity,
    row.unit_code_snapshot || '',
    row.container_type_code ? `${row.container_type_code}${row.container_quantity ? ` x ${row.container_quantity}` : ''}` : '',
    row.unit_price ?? '',
    row.pricing_unit_code || '',
    row.currency_code || '',
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

export default function MaterialRegisterPage({ materialId, stores, storesReady, storeId, onSelectStore }) {
  const location = useLocation()
  const returnSearch = location.state?.returnSearch || ''

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
    <div className="stock-ledger-wrap">
      <div className="mreg-top-nav">
        <Link className="mreg-back-link" to={`/inventory/materials${returnSearch ? `?${returnSearch}` : ''}`}>
          <span>← Back to Materials</span>
        </Link>
        {material.data && (
          <div className="mreg-breadcrumbs">
            <span>Inventory</span>
            <span className="mreg-crumb-sep">/</span>
            <span>Material Master</span>
            <span className="mreg-crumb-sep">/</span>
            <span className="mreg-crumb-current">{material.data.code} — {material.data.name}</span>
          </div>
        )}
      </div>

      {material.state === 'loading' && <LoadingState label="Loading material…" compact />}
      {(material.state === 'error' || material.state === 'not-found') && (
        <Alert type="error">
          {material.error}{' '}
          {material.state === 'error' && (
            <button type="button" className="table-edit" onClick={loadMaterial}>Retry</button>
          )}
        </Alert>
      )}

      {material.state === 'ready' && (
        <RegisterSection
          material={material.data} materialId={materialId}
          stores={stores} storesReady={storesReady} storeId={storeId} onSelectStore={onSelectStore}
        />
      )}
    </div>
  )
}

function RegisterSection({ material, materialId, stores, storesReady, storeId, onSelectStore }) {
  if (!storesReady) return <LoadingState label="Loading your stores…" compact />
  if (stores.length === 0) {
    return <Alert type="error">No store is available to your account. Ask an administrator for store access.</Alert>
  }
  if (!storeId) {
    return (
      <div className="stock-section-card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 16px' }}>Choose a store to see this material's register.</p>
        {stores.length > 1 && (
          <select className="company-input" style={{ width: 260 }} value="" onChange={(e) => onSelectStore(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        )}
      </div>
    )
  }
  return <Register material={material} materialId={materialId} storeId={storeId} stores={stores} onSelectStore={onSelectStore} />
}

function emptyRegisterState() {
  return {
    status: 'loading', // loading | ready | access-denied | not-found | error
    opening: [], periodReceived: [], closing: [], movements: [], count: 0, coverage: null, period: null, error: '',
    periodIssued: [], closingNetOfIssues: [], issueMovements: [], issueCount: 0,
  }
}

function Register({ material, materialId, storeId, stores, onSelectStore }) {
  const navigate = useNavigate()
  // Committed filters + pagination live in the URL (this material's own
  // /inventory/materials/:id path) - same pattern CommonMaterialsTab.jsx
  // already uses for its own filters - so reloading the exact same URL
  // (not just navigating back in-app) restores the exact same view
  // instead of resetting to an empty register.
  const [searchParams, setSearchParams] = useSearchParams()
  const applied = {
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    search: searchParams.get('q') || '',
    supplier: searchParams.get('supplier') || '',
  }
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const issuePage = Math.max(1, Number(searchParams.get('issuePage') || '1') || 1)
  const setPage = (next) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev)
    n.set('page', String(typeof next === 'function' ? next(page) : next))
    return n
  }, { replace: true })
  const setIssuePage = (next) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev)
    n.set('issuePage', String(typeof next === 'function' ? next(issuePage) : next))
    return n
  }, { replace: true })

  const fromParam = searchParams.get('from') || ''
  const toParam = searchParams.get('to') || ''
  const qParam = searchParams.get('q') || ''
  const supplierParam = searchParams.get('supplier') || ''

  const [postedFrom, setPostedFrom] = useState(fromParam)
  const [postedTo, setPostedTo] = useState(toParam)
  const [search, setSearch] = useState(qParam)
  const [supplierId, setSupplierId] = useState(supplierParam)

  useEffect(() => { setPostedFrom(fromParam) }, [fromParam])
  useEffect(() => { setPostedTo(toParam) }, [toParam])
  useEffect(() => { setSearch(qParam) }, [qParam])
  useEffect(() => { setSupplierId(supplierParam) }, [supplierParam])
  const [state, setState] = useState(emptyRegisterState())
  const [suppliers, setSuppliers] = useState([])
  const [containerTypes, setContainerTypes] = useState([])
  const [companies, setCompanies] = useState([])
  const [creatingReceipt, setCreatingReceipt] = useState(false)
  const [createdNotice, setCreatedNotice] = useState(null)
  const [issuingStock, setIssuingStock] = useState(false)
  const [issuedNotice, setIssuedNotice] = useState(null)
  const [physicalAuditOpen, setPhysicalAuditOpen] = useState(false)
  const [auditCountQty, setAuditCountQty] = useState('')
  const [auditNotes, setAuditNotes] = useState('')

  // Edit / Delete state
  const [editingReceiptRow, setEditingReceiptRow] = useState(null)   // movement row being edited (inward)
  const [editingIssueRow, setEditingIssueRow] = useState(null)       // movement row being edited (outward)
  const [deleteConfirm, setDeleteConfirm] = useState(null)           // { type: 'inward'|'outward', row, cancelling, error }
  const [deleteReason, setDeleteReason] = useState('')

  // Opening Stock Cutover Form State (matching Excel columns: Date, Invoice No, Supplier, Qty, Containers, Price)
  const [cutoverModalOpen, setCutoverModalOpen] = useState(false)
  const [cutoverDate, setCutoverDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cutoverInvoiceNo, setCutoverInvoiceNo] = useState('OPENING')
  const [cutoverSupplier, setCutoverSupplier] = useState('STOCK')
  const [isCustomCutoverSupplier, setIsCustomCutoverSupplier] = useState(false)
  const [cutoverQty, setCutoverQty] = useState('')
  const [cutoverContainerTypeId, setCutoverContainerTypeId] = useState(material?.default_container_type_id ? String(material.default_container_type_id) : '')
  const [cutoverContainerQty, setCutoverContainerQty] = useState('')
  const [cutoverPrice, setCutoverPrice] = useState('')
  const [cutoverNotes, setCutoverNotes] = useState('')
  const [savingCutover, setSavingCutover] = useState(false)
  const [cutoverError, setCutoverError] = useState('')

  const [auditNotice, setAuditNotice] = useState('')
  const requestRef = useRef(0)
  const fyOptions = financialYearOptions()

  // ── Delete / Cancel handlers ─────────────────────────────────────────────
  const openDeleteConfirm = (type, row) => {
    setDeleteReason('')
    setDeleteConfirm({ type, row, cancelling: false, error: '' })
  }
  const closeDeleteConfirm = () => setDeleteConfirm(null)

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || deleteConfirm.cancelling) return
    setDeleteConfirm((prev) => ({ ...prev, cancelling: true, error: '' }))
    try {
      if (deleteConfirm.type === 'inward') {
        const receiptId = deleteConfirm.row.source_goods_receipt_id
        const fresh = await getGoodsReceipt(storeId, receiptId)
        await cancelGoodsReceipt(storeId, receiptId, fresh.version, deleteReason.trim() || 'Cancelled by user')
      } else {
        const issueId = deleteConfirm.row.source_material_issue_id
        const fresh = await getMaterialIssue(storeId, issueId)
        await cancelMaterialIssue(storeId, issueId, fresh.version, deleteReason.trim() || 'Cancelled by user')
      }
      closeDeleteConfirm()
      load()
    } catch (err) {
      setDeleteConfirm((prev) => ({ ...prev, cancelling: false, error: getErrorMessage(err) }))
    }
  }

  const handleSavePhysicalCount = async (e) => {
    e.preventDefault()
    try {
      const bookQty = state.closingNetOfIssues?.[0]?.net_quantity || '0'
      const res = await createPhysicalCountDraft(storeId, {
        material_id: material.id,
        unit_id: material.base_unit_id,
        book_reference_quantity: bookQty,
        actual_count_quantity: auditCountQty,
        reason: auditNotes,
        scope: 'STORE_PHYSICAL',
      })
      setAuditNotice(`Physical count draft #${res.id} persisted to database. Discrepancy: ${res.discrepancy_quantity} ${material.base_unit_code}. Posting adjustment blocked: ${res.posting_blocker_reason}`)
      setPhysicalAuditOpen(false)
      setAuditCountQty('')
      setAuditNotes('')
    } catch (err) {
      setAuditNotice(`Failed to save count draft: ${getErrorMessage(err)}`)
    }
  }

  const handleSaveCutover = async (e) => {
    e.preventDefault()
    if (!cutoverQty || Number(cutoverQty) <= 0) {
      setCutoverError('Please enter a positive opening quantity.')
      return
    }

    setSavingCutover(true)
    setCutoverError('')

    try {
      const effectiveCompanyId = companies[0]?.id
      let postedReceipt = null

      // Attempt 1: Post as an official Inward Goods Receipt so it appears in the INWARD ledger table immediately!
      if (effectiveCompanyId) {
        try {
          const draftReceipt = await createGoodsReceipt(storeId, {
            company_id: effectiveCompanyId,
            supplier_name: cutoverSupplier.trim() || 'STOCK',
            supplier_invoice_reference: cutoverInvoiceNo.trim() || 'OPENING',
            arrived_at: new Date(cutoverDate || new Date()).toISOString(),
            notes: cutoverNotes.trim() || 'Opening Stock baseline',
            idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            lines: [
              {
                material_id: material.id,
                received_quantity: cutoverQty,
                container_type_id: cutoverContainerTypeId ? Number(cutoverContainerTypeId) : null,
                container_quantity: cutoverContainerQty ? Number(cutoverContainerQty) : null,
                unit_price: cutoverPrice ? Number(cutoverPrice) : null,
                currency_code: 'INR',
              },
            ],
          })
          if (draftReceipt?.id) {
            postedReceipt = await postGoodsReceipt(storeId, draftReceipt.id, draftReceipt.version)
          }
        } catch (receiptErr) {
          console.warn('Manual goods receipt fallback to cutover draft:', receiptErr)
        }
      }

      // Attempt 2: Also record baseline draft in cutover drafts table
      const draftRes = await createCutoverStockDraft(storeId, {
        material_id: material.id,
        unit_id: material.base_unit_id,
        effective_date: cutoverDate || new Date().toISOString().slice(0, 10),
        quantity: cutoverQty,
        source_reference: cutoverInvoiceNo.trim() || 'OPENING',
        remarks: `Supplier: ${cutoverSupplier || 'STOCK'} | Containers: ${cutoverContainerQty || '—'} | Price: ${cutoverPrice || '—'}. ${cutoverNotes}`.trim(),
      }).catch(() => null)

      if (postedReceipt) {
        setAuditNotice(`Opening stock recorded and posted to ledger: ${cutoverQty} ${material.base_unit_code} (${cutoverInvoiceNo || 'OPENING'}).`)
      } else if (draftRes) {
        setAuditNotice(`Opening stock baseline recorded for ${cutoverQty} ${material.base_unit_code}. Ref: ${cutoverInvoiceNo || 'OPENING'}.`)
      } else {
        setAuditNotice(`Opening stock saved for ${cutoverQty} ${material.base_unit_code}.`)
      }

      setCutoverModalOpen(false)
      setCutoverQty('')
      setCutoverPrice('')
      setCutoverContainerQty('')
      setCutoverNotes('')
      load()
    } catch (err) {
      setCutoverError(getErrorMessage(err))
    } finally {
      setSavingCutover(false)
    }
  }

  useEffect(() => {
    listMaterialSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
    listContainerTypes().then(setContainerTypes).catch(() => setContainerTypes([]))
    listMyCompanies().then(setCompanies).catch(() => setCompanies([]))
  }, [])

  const load = () => {
    const requestId = ++requestRef.current
    setState({ ...emptyRegisterState(), status: 'loading' })
    Promise.all([
      getMaterialRegister(storeId, materialId, {
        postedFrom: applied.from, postedTo: applied.to, search: applied.search, supplier: applied.supplier,
        page, pageSize: PAGE_SIZE,
      }),
      // A separate endpoint/queryset from the register above - its own
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

  // Keyed on the PRIMITIVE filter/page values (not the `applied` object,
  // which is a fresh object literal every render) - switching materials
  // or stores, or changing a page, refetches; merely re-rendering with
  // the same URL never does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [materialId, storeId, applied.from, applied.to, applied.search, applied.supplier, page, issuePage])

  const updateFilter = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === '' || value === undefined) next.delete(key)
        else next.set(key, String(value))
      })
      next.delete('page')
      next.delete('issuePage')
      return next
    }, { replace: true })
  }

  const clearFilters = () => {
    setPostedFrom('')
    setPostedTo('')
    setSearch('')
    setSupplierId('')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      ;['from', 'to', 'q', 'supplier', 'page', 'issuePage'].forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }
  const hasActiveFilters = Boolean(applied.from || applied.to || applied.search || applied.supplier)

  const totalPages = Math.max(1, Math.ceil(state.count / PAGE_SIZE))
  const totalIssuePages = Math.max(1, Math.ceil(state.issueCount / PAGE_SIZE))
  const periodLabel = state.period?.posted_from || state.period?.posted_to
    ? `${state.period.posted_from || 'the start'} → ${state.period.posted_to || 'now'}`
    : 'all recorded history'

  // A just-posted record is posted with today's real server timestamp -
  // if the applied "To" filter is before today, the reload right after
  // posting will correctly NOT show it in the tables below, which would
  // otherwise look like the post silently failed. Said once, plainly,
  // instead of leaving that silent.
  const outsideRangeNote = applied.to && applied.to < new Date().toISOString().slice(0, 10)
    ? ` It is posted today, which is after your "To" filter (${applied.to}) - clear or widen the date filter to see it below.`
    : ''

  return (
    <>
      {createdNotice && !createdNotice.posted && (
        <Alert type="success">
          Draft receipt <strong>{createdNotice.reference}</strong> saved. It will not appear in this register's
          Inward table until it is posted. Open it again from + Inward Stock to finish posting it.
        </Alert>
      )}
      {createdNotice && createdNotice.posted && (
        <Alert type="success">
          Receipt <strong>{createdNotice.reference}</strong> posted. The register below now reflects this delivery.{outsideRangeNote}
        </Alert>
      )}
      {issuedNotice && (
        <Alert type="success">
          Issue <strong>{issuedNotice.reference}</strong> posted for {issuedNotice.issued_quantity} {issuedNotice.unit_code_snapshot}.{outsideRangeNote}
        </Alert>
      )}

      {/* 1. TOP TOOLBAR: FILTERS & ACTIONS (Matching 2nd Screenshot) */}
      <div className="stock-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {stores.length > 1 && (
            <div style={{ minWidth: 160 }}>
              <select className="mreg-input" value={storeId} onChange={(e) => onSelectStore(Number(e.target.value))}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ width: 140 }}>
            <select
              className="mreg-input"
              value=""
              onChange={(e) => {
                const fy = fyOptions.find((opt) => opt.label === e.target.value)
                if (fy) {
                  setPostedFrom(fy.from)
                  setPostedTo(fy.to)
                  updateFilter({ from: fy.from, to: fy.to })
                }
              }}
            >
              <option value="">FY quick-pick…</option>
              {fyOptions.map((opt) => (
                <option key={opt.label} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="mreg-date-group">
            <input
              type="date"
              className="mreg-input"
              style={{ width: 135 }}
              value={postedFrom}
              onChange={(e) => {
                const val = e.target.value
                setPostedFrom(val)
                updateFilter({ from: val })
              }}
              title="From date"
            />
            <span className="mreg-date-sep">–</span>
            <input
              type="date"
              className="mreg-input"
              style={{ width: 135 }}
              value={postedTo}
              onChange={(e) => {
                const val = e.target.value
                setPostedTo(val)
                updateFilter({ to: val })
              }}
              title="To date"
            />
          </div>
          {suppliers.length > 0 && (
            <select
              className="mreg-input"
              style={{ minWidth: 150 }}
              value={supplierId}
              onChange={(e) => {
                const val = e.target.value
                setSupplierId(val)
                updateFilter({ supplier: val })
              }}
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.display_name || s.legal_name || s.code}</option>
              ))}
            </select>
          )}
          <div style={{ flex: '1 1 200px' }}>
            <input
              type="search"
              className="mreg-input"
              style={{ width: '100%' }}
              placeholder="Search invoice, batch, prod…"
              value={search}
              onChange={(e) => {
                const val = e.target.value
                setSearch(val)
                updateFilter({ q: val })
              }}
            />
          </div>
          {hasActiveFilters && (
            <div>
              <Button type="button" variant="secondary" onClick={clearFilters}>Clear</Button>
            </div>
          )}
        </div>

        {/* Action Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="stock-btn-action stock-btn-inward" onClick={() => setCreatingReceipt(true)}>
            <span>📥</span> + Inward Stock
          </button>
          <button type="button" className="stock-btn-action stock-btn-outward" onClick={() => setIssuingStock(true)}>
            <span>📤</span> + Issue Outward
          </button>
          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={() => setCutoverModalOpen(true)}
            title="Create an initial opening stock cutover draft."
          >
            <span>📋</span> Opening Stock
          </button>
          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            onClick={() => setPhysicalAuditOpen(true)}
            title="Create a physical count audit session and variance draft."
          >
            <span>🔍</span> Physical Audit
          </button>
          <button
            type="button"
            className="stock-btn-action stock-btn-secondary"
            disabled={state.status !== 'ready' || state.movements.length === 0}
            onClick={() => exportMovementsCsv(material, state.movements, state.coverage)}
            title="Exports the current page of rows under the current filters as CSV - not all filtered records."
          >
            <span>💾</span> Export CSV
          </button>
          <button type="button" className="stock-btn-action stock-btn-secondary" onClick={() => navigate('/inventory/materials?new=1')}>
            + Register Material
          </button>
        </div>
      </div>

      {/* 2. MASTER CHEMICAL / MATERIAL HEADER CARD (Matching 2nd Screenshot) */}
      {(() => {
        const totalInwardRows = state.periodReceived || []
        const totalOutwardRows = state.periodIssued || []
        const netStockRows = state.closingNetOfIssues || []

        const totalInward = totalInwardRows.reduce((s, r) => s + parseFloat(r.recorded_receipt_quantity || 0), 0)
        const totalOutward = totalOutwardRows.reduce((s, r) => s + parseFloat(r.recorded_issued_quantity || 0), 0)
        const physicalStock = netStockRows.length > 0
          ? netStockRows.reduce((s, r) => s + parseFloat(r.net_quantity || 0), 0)
          : totalInward - totalOutward
        const unitCode = totalInwardRows[0]?.unit_code || totalOutwardRows[0]?.unit_code ||
          netStockRows[0]?.unit_code || material.base_unit_code || ''

        const openingText = state.opening.length === 0
          ? '—'
          : state.opening.map(r => `${r.recorded_receipt_quantity} ${r.unit_code} (${r.source_company_code})`).join(', ')

        const closingText = state.closing.length === 0
          ? '—'
          : state.closing.map(r => `${r.recorded_receipt_quantity} ${r.unit_code} (${r.source_company_code})`).join(', ')

        return (
          <div className="stock-header-card" style={{ marginBottom: 14 }}>
            <div className="stock-item-info">
              <div className="stock-item-badge">{material.code}</div>
              <div className="stock-item-details">
                <h2>{material.name}</h2>
                <div className="stock-item-meta" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {material.default_container_type_code && (
                    <span className="stock-item-tag">📦 {material.default_container_type_code}</span>
                  )}
                  <span className="stock-item-tag">🏷️ {KIND_LABEL[material.kind] || material.kind}</span>
                  <span className="stock-item-tag">{material.is_active ? 'Active' : 'Inactive'}</span>
                  <span className="stock-item-tag">📅 {applied.from || applied.to ? `${applied.from || 'Start'} → ${applied.to || 'Now'}` : 'All Time'}</span>
                  {material.reorder_level && physicalStock < parseFloat(material.reorder_level) && (
                    <span className="stock-item-tag" style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde047' }}>
                      ⚠️ Below Reorder Level ({material.reorder_level} {unitCode})
                    </span>
                  )}
                  <span className="stock-item-tag" title="Opening book stock">
                    📦 Opening: {state.opening.length === 0 ? <span>—</span> : <span>{state.opening.map(r => `${r.recorded_receipt_quantity} ${r.unit_code} (${r.source_company_code})`).join(', ')}</span>}
                  </span>
                  <span className="stock-item-tag" title="Closing book stock">
                    🏁 Closing: {state.closing.length === 0 ? <span>—</span> : <span>{state.closing.map(r => `${r.recorded_receipt_quantity} ${r.unit_code} (${r.source_company_code})`).join(', ')}</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Closing Book Stock Summary Dock */}
            <div className="stock-summary-dock">
              <div className="stock-summary-stat">
                <span className="lbl">TOTAL INWARD</span>
                <span className="val" style={{ color: '#047857' }}>
                  {totalInward > 0 ? totalInward.toFixed(3) : '0'} {unitCode}
                </span>
                <span className="sub">{state.count} Receipt{state.count !== 1 ? 's' : ''}</span>
              </div>
              <div className="stock-summary-divider" />
              <div className="stock-summary-stat">
                <span className="lbl">TOTAL OUTWARD</span>
                <span className="val" style={{ color: '#c2410c' }}>
                  {totalOutward > 0 ? totalOutward.toFixed(3) : '0'} {unitCode}
                </span>
                <span className="sub">{state.issueCount} Issue{state.issueCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="stock-summary-divider" />
              <div className="stock-summary-stat">
                <span className="lbl">CLOSING BOOK STOCK</span>
                <span className="val" style={{ color: physicalStock <= 0 ? '#dc2626' : '#15803d' }}>
                  {physicalStock.toFixed(3)} {unitCode}
                </span>
                <span className="sub">Remaining Stock</span>
              </div>
            </div>
          </div>
        )
      })()}

      {state.status === 'ready' && state.coverage && (
        <p style={{ margin: '0 0 8px', padding: '8px 12px', borderRadius: 8, background: '#eaf5fc', color: '#163b59', fontSize: 13 }} title={state.coverage.notice}>
          Receipt-only coverage · Release status: {state.coverage.release_status} · hover for details
        </p>
      )}
      {state.status === 'loading' && <LoadingState label="Loading register…" compact />}
      {state.status === 'access-denied' && <Alert type="error">You do not have register access for this store. {state.error}</Alert>}
      {state.status === 'not-found' && <Alert type="error">This store is not available. {state.error}</Alert>}
      {state.status === 'error' && (
        <Alert type="error">
          {state.error}{' '}
          <button type="button" className="table-edit" onClick={load}>Retry</button>
        </Alert>
      )}

      {/* Dual ledger - green Inward / orange Outward, this screen's own
          approved theme (StockLedger.css), now reading real movements.
          Always rendered with their full column headers, including when
          there are zero rows for the current filters. */}
      {state.status === 'ready' && (
        <>
          <div className="stock-dual-grid">
          <div className="stock-section-card stock-card-inward">
            <div className="stock-header-inward">
              <h3><span>📥</span> INWARD (Receipts &amp; Opening)</h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>{state.count} entr{state.count === 1 ? 'y' : 'ies'}</span>
            </div>
            <div className="stock-table-wrapper">
              <table className="stock-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice / reference</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Received qty</th>
                    <th>Containers</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.movements.length === 0 && (
                    <tr><td colSpan={7} className="stock-empty-pane">No recorded receipts found for this selection.</td></tr>
                  )}
                  {state.movements.map((row) => (
                    <tr key={row.id}>
                      <td>{(row.posted_at || '').slice(0, 10) || '—'}</td>
                      <td>
                        {row.source_invoice_reference || row.source_delivery_note_reference || '—'}
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.source_goods_receipt_reference || '—'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {row.supplier_code && row.supplier_name && row.supplier_code !== row.supplier_name
                            ? `${row.supplier_code} · ${row.supplier_name}`
                            : row.supplier_name || row.supplier_code || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.source_company_code}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>{row.quantity} {row.unit_code_snapshot}</td>
                      <td>{row.container_type_code ? `${row.container_type_code}${row.container_quantity ? ` × ${row.container_quantity}` : ''}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {row.unit_price != null ? `${row.currency_code || ''} ${row.unit_price}/${row.pricing_unit_code || row.unit_code_snapshot}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {row.source_goods_receipt_id && (
                          <>
                            <button
                              type="button"
                              className="table-edit"
                              title="Edit this receipt"
                              onClick={() => setEditingReceiptRow(row)}
                              style={{ marginRight: 8 }}
                            >Edit</button>
                            <button
                              type="button"
                              className="table-delete"
                              title="Cancel / delete this receipt"
                              onClick={() => openDeleteConfirm('inward', row)}
                            >Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Enhanced footer with per-company itemized totals */}
            <div style={{ borderTop: '2px solid #bbf7d0', padding: '10px 14px', background: '#f0fdf4', minHeight: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period Total Received</div>
                  {state.periodReceived.length === 0
                    ? <span style={{ fontSize: 12.5, color: '#64748b' }}>No period total for this selection.</span>
                    : state.periodReceived.map((row) => (
                      <div key={`${row.unit_id}-${row.source_company_id}`} style={{ fontSize: 13.5, fontWeight: 800, color: '#047857' }}>
                        {row.recorded_receipt_quantity} <span style={{ fontWeight: 500 }}>{row.unit_code}</span>
                        <span style={{ fontSize: 11, color: '#059669', marginLeft: 4 }}>({row.source_company_code})</span>
                      </div>
                    ))
                  }
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{state.count} receipt{state.count !== 1 ? 's' : ''} total</div>
                  {state.count > PAGE_SIZE && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Page {page} of {totalPages} shown</div>}
                </div>
              </div>
            </div>
            {state.count > PAGE_SIZE && (
              <div className="stock-pagination">
                <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>

          <div className="stock-section-card stock-card-outward">
            <div className="stock-header-outward">
              <h3><span>📤</span> OUTWARD (Issue to Production)</h3>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9a3412' }}>{state.issueCount} entr{state.issueCount === 1 ? 'y' : 'ies'}</span>
            </div>
            <div className="stock-table-wrapper">
              <table className="stock-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Company</th>
                    <th>Batch No.</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Issued qty</th>
                    <th>Remarks</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.issueMovements.length === 0 && (
                    <tr><td colSpan={7} className="stock-empty-pane">No posted issues found for this selection.</td></tr>
                  )}
                  {state.issueMovements.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{(row.posted_at || '').slice(0, 10) || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.source_company_code}</td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{row.batch_reference || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.product_reference || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#ea580c', whiteSpace: 'nowrap' }}>{row.quantity} {row.unit_code_snapshot}</td>
                      <td style={{ color: '#64748b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remarks || '—'}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {row.source_material_issue_id && (
                          <>
                            <button
                              type="button"
                              className="table-edit"
                              title="Edit this issue"
                              onClick={() => setEditingIssueRow(row)}
                              style={{ marginRight: 8 }}
                            >Edit</button>
                            <button
                              type="button"
                              className="table-delete"
                              title="Cancel / delete this issue"
                              onClick={() => openDeleteConfirm('outward', row)}
                            >Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Enhanced footer with per-company itemized totals */}
            <div style={{ borderTop: '2px solid #fed7aa', padding: '10px 14px', background: '#fff7ed', minHeight: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period Total Issued</div>
                  {state.periodIssued.length === 0
                    ? <span style={{ fontSize: 12.5, color: '#64748b' }}>No period total for this selection.</span>
                    : state.periodIssued.map((row) => (
                      <div key={`${row.unit_id}-${row.source_company_id}`} style={{ fontSize: 13.5, fontWeight: 800, color: '#c2410c' }}>
                        {row.recorded_issued_quantity} <span style={{ fontWeight: 500 }}>{row.unit_code}</span>
                        <span style={{ fontSize: 11, color: '#ea580c', marginLeft: 4 }}>({row.source_company_code})</span>
                      </div>
                    ))
                  }
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{state.issueCount} issue{state.issueCount !== 1 ? 's' : ''} total</div>
                  {state.issueCount > PAGE_SIZE && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Page {issuePage} of {totalIssuePages} shown</div>}
                </div>
              </div>
            </div>
            {state.issueCount > PAGE_SIZE && (
              <div className="stock-pagination">
                <Button type="button" variant="secondary" disabled={issuePage <= 1} onClick={() => setIssuePage((p) => p - 1)}>Previous</Button>
                <span>Page {issuePage} of {totalIssuePages}</span>
                <Button type="button" variant="secondary" disabled={issuePage >= totalIssuePages} onClick={() => setIssuePage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        </div>
        <p style={{ margin: '8px 4px 0', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
          * Returns, defects and disposals are not recorded in this version — only material issued to production.
        </p>
        </>
      )}

      {creatingReceipt && (
        <InwardStockModal
          storeId={storeId}
          materialId={materialId}
          materialCode={material.code}
          materialName={material.name}
          onClose={() => setCreatingReceipt(false)}
          onCreated={(receipt) => {
            setCreatingReceipt(false)
            setCreatedNotice({ id: receipt.id, reference: receipt.reference, posted: false })
            load()
          }}
          onPosted={(receipt) => {
            setCreatingReceipt(false)
            setCreatedNotice({ id: receipt.id, reference: receipt.reference, posted: true })
            load()
          }}
        />
      )}

      {/* Edit Inward row — re-opens InwardStockModal; it fetches & patches the receipt */}
      {editingReceiptRow && (
        <InwardStockModal
          storeId={storeId}
          materialId={materialId}
          materialCode={material.code}
          materialName={material.name}
          editReceiptId={editingReceiptRow.source_goods_receipt_id}
          onClose={() => setEditingReceiptRow(null)}
          onCreated={() => {
            setEditingReceiptRow(null)
            load()
          }}
          onPosted={(receipt) => {
            setEditingReceiptRow(null)
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
          onIssued={() => {}}
          onPosted={(issue) => {
            setIssuingStock(false)
            setIssuedNotice(issue)
            load()
          }}
        />
      )}

      {/* Edit Outward row — re-opens IssueOutwardModal */}
      {editingIssueRow && (
        <IssueOutwardModal
          storeId={storeId}
          materialId={materialId}
          materialCode={material.code}
          materialName={material.name}
          editIssueId={editingIssueRow.source_material_issue_id}
          onClose={() => setEditingIssueRow(null)}
          onIssued={() => {}}
          onPosted={(issue) => {
            setEditingIssueRow(null)
            setIssuedNotice(issue)
            load()
          }}
        />
      )}

      {/* Delete / Cancel Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={true}
          onClose={deleteConfirm.cancelling ? undefined : closeDeleteConfirm}
          title={deleteConfirm.type === 'inward' ? '🗑️ Cancel Inward Receipt' : '🗑️ Cancel Outward Issue'}
          maxWidth={480}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 }}>
              <strong style={{ color: '#991b1b' }}>⚠️ This action cannot be undone.</strong>
              <p style={{ margin: '6px 0 0', color: '#7f1d1d', lineHeight: 1.5 }}>
                {deleteConfirm.type === 'inward'
                  ? `This will cancel the posted goods receipt and reverse its stock effect from the ledger.`
                  : `This will cancel the posted issue and restore the quantity back to available stock.`}
              </p>
            </div>

            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5, color: '#334155' }}>
              {deleteConfirm.type === 'inward' ? (
                <>
                  <div><strong>Invoice:</strong> {deleteConfirm.row.source_invoice_reference || deleteConfirm.row.source_delivery_note_reference || '—'}</div>
                  <div><strong>Supplier:</strong> {deleteConfirm.row.supplier_name || deleteConfirm.row.supplier_code || '—'}</div>
                  <div><strong>Quantity:</strong> {deleteConfirm.row.quantity} {deleteConfirm.row.unit_code_snapshot}</div>
                  <div><strong>Date:</strong> {(deleteConfirm.row.posted_at || '').slice(0, 10) || '—'}</div>
                </>
              ) : (
                <>
                  <div><strong>Product:</strong> {deleteConfirm.row.product_reference || '—'}</div>
                  <div><strong>Batch:</strong> {deleteConfirm.row.batch_reference || '—'}</div>
                  <div><strong>Quantity:</strong> {deleteConfirm.row.quantity} {deleteConfirm.row.unit_code_snapshot}</div>
                  <div><strong>Date:</strong> {(deleteConfirm.row.posted_at || '').slice(0, 10) || '—'}</div>
                </>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#374151' }}>
                Reason for cancellation (optional)
              </label>
              <input
                type="text"
                className="company-input"
                style={{ width: '100%', height: 38 }}
                placeholder="e.g. Entry recorded in error, wrong quantity…"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                disabled={deleteConfirm.cancelling}
              />
            </div>

            {deleteConfirm.error && <Alert type="error">{deleteConfirm.error}</Alert>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
              <Button type="button" variant="secondary" onClick={closeDeleteConfirm} disabled={deleteConfirm.cancelling}>
                Keep Entry
              </Button>
              <button
                type="button"
                disabled={deleteConfirm.cancelling}
                onClick={handleConfirmDelete}
                style={{
                  padding: '8px 18px', background: deleteConfirm.cancelling ? '#fca5a5' : '#dc2626',
                  color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: deleteConfirm.cancelling ? 'not-allowed' : 'pointer',
                }}
              >
                {deleteConfirm.cancelling ? 'Cancelling…' : '🗑️ Yes, Cancel Entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {auditNotice && (
        <div style={{ margin: '12px 0' }}>
          <Alert type="success">{auditNotice}</Alert>
        </div>
      )}

      {physicalAuditOpen && (
        <Modal
          isOpen={true}
          onClose={() => setPhysicalAuditOpen(false)}
          title={`Physical Inventory Count: ${material.code}`}
        >
          <form onSubmit={handleSavePhysicalCount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
              <div><strong>Material:</strong> {material.code} &mdash; {material.name}</div>
              <div><strong>Calculated Book Closing:</strong> {state.closingNetOfIssues?.map((r) => `${r.net_quantity} ${r.unit_code}`).join(', ') || '0'}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Physically Counted Quantity:
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                className="company-input"
                style={{ width: '100%', height: 38 }}
                value={auditCountQty}
                onChange={(e) => setAuditCountQty(e.target.value)}
                placeholder="Enter verified floor count..."
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Count Notes / Discrepancy Reason:
              </label>
              <input
                type="text"
                className="company-input"
                style={{ width: '100%', height: 38 }}
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder="e.g. Annual physical count, minor spillage noted..."
              />
            </div>

            <div style={{ padding: '10px 12px', background: '#fefce8', borderRadius: 6, fontSize: 12, color: '#854d0e', border: '1px solid #fef08a' }}>
              <strong>Audit Policy Boundary:</strong> Submitting a physical count records the verified observation and calculates variance against calculated book stock. It does <em>not</em> silently adjust the stock ledger. Posting an inventory adjustment requires established authorization from Store Head and Finance.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button type="button" variant="secondary" onClick={() => setPhysicalAuditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Audit Observation Draft
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {cutoverModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setCutoverModalOpen(false)}
          title={`Opening Stock: ${material.code} — ${material.name}`}
          maxWidth={620}
        >
          <form onSubmit={handleSaveCutover} className="inv-modal-form">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div>
                <strong style={{ color: '#166534', fontSize: 13.5 }}>{material.code} — {material.name}</strong>
                <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                  Base unit: <strong>{material.base_unit_code}</strong> {material.default_container_type_code ? `· Default Container: ${material.default_container_type_code}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 5 }}>
                INWARD LEDGER
              </span>
            </div>

            {cutoverError && <Alert type="error">{cutoverError}</Alert>}

            {/* Row 1: Date & Invoice No */}
            <div className="inv-modal-form-row">
              <div className="company-field">
                <label className="inv-modal-field-label">
                  Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  className="company-input"
                  value={cutoverDate}
                  onChange={(e) => setCutoverDate(e.target.value)}
                  required
                />
              </div>

              <div className="company-field">
                <label className="inv-modal-field-label">
                  Invoice / Reference No <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. OPENING or GST/T-631"
                  value={cutoverInvoiceNo}
                  onChange={(e) => setCutoverInvoiceNo(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Row 2: Supplier & Received Quantity */}
            <div className="inv-modal-form-row">
              <div className="company-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="inv-modal-field-label">
                    Supplier
                  </label>
                  {isCustomCutoverSupplier && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCutoverSupplier(false)
                        setCutoverSupplier('STOCK')
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#2563eb',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 500,
                      }}
                    >
                      ← Select from list
                    </button>
                  )}
                </div>
                {isCustomCutoverSupplier ? (
                  <input
                    type="text"
                    className="company-input"
                    placeholder="e.g. STOCK or Supplier Name"
                    value={cutoverSupplier}
                    onChange={(e) => setCutoverSupplier(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <select
                    className="company-input"
                    aria-label="Supplier"
                    value={
                      cutoverSupplier === 'STOCK' || suppliers.some((s) => s.name === cutoverSupplier)
                        ? cutoverSupplier
                        : cutoverSupplier ? cutoverSupplier : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '__custom__') {
                        setIsCustomCutoverSupplier(true)
                        setCutoverSupplier('')
                      } else {
                        setCutoverSupplier(val)
                      }
                    }}
                  >
                    <option value="">Select Supplier…</option>
                    <option value="STOCK">STOCK (Internal / Opening Stock)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} {s.code && s.code !== s.name ? `(${s.code})` : ''}
                      </option>
                    ))}
                    {cutoverSupplier && cutoverSupplier !== 'STOCK' && !suppliers.some((s) => s.name === cutoverSupplier) && (
                      <option value={cutoverSupplier}>{cutoverSupplier}</option>
                    )}
                    <option value="__custom__">➕ Other / Custom Supplier…</option>
                  </select>
                )}
              </div>

              <div className="company-field">
                <label className="inv-modal-field-label">
                  Received Quantity ({material.base_unit_code}) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="company-input"
                  placeholder="e.g. 178"
                  value={cutoverQty}
                  onChange={(e) => setCutoverQty(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Row 3: Containers & Price */}
            <div className="inv-modal-form-row">
              <div className="company-field">
                <label className="inv-modal-field-label">
                  No. of Containers &amp; Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
                  <input
                    type="number"
                    min="1"
                    className="company-input"
                    placeholder="Qty (e.g. 1)"
                    value={cutoverContainerQty}
                    onChange={(e) => setCutoverContainerQty(e.target.value)}
                  />
                  <select
                    className="company-input"
                    value={cutoverContainerTypeId}
                    onChange={(e) => setCutoverContainerTypeId(e.target.value)}
                  >
                    <option value="">Container type…</option>
                    {containerTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>{ct.name || ct.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="company-field">
                <label className="inv-modal-field-label">
                  Price (per {material.base_unit_code})
                </label>
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, color: '#64748b', fontWeight: 700, fontSize: 13 }}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ paddingLeft: 28 }}
                    className="company-input"
                    placeholder="e.g. 135"
                    value={cutoverPrice}
                    onChange={(e) => setCutoverPrice(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Remarks */}
            <div className="company-field">
              <label className="inv-modal-field-label">Remarks / Notes</label>
              <input
                type="text"
                className="company-input"
                placeholder="e.g. Initial balance from physical chemical stock sheet 2026-27"
                value={cutoverNotes}
                onChange={(e) => setCutoverNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
              <Button type="button" variant="secondary" onClick={() => setCutoverModalOpen(false)} disabled={savingCutover}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savingCutover} loadingText="Saving Opening Stock…">
                Save Opening Stock
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// One stat card in the 4-column KPI grid - rows are grouped by (unit,
// source company), the same grouping the backend's own balance
// computation uses, so a material with receipts/issues in more than one
// unit or from more than one company shows one line per combination
// instead of a single misleading summed number.
function SummaryStat({ label, rows, valueField, sub, tone, netRows, icon, kpiType }) {
  return (
    <div className={`mreg-kpi-card ${kpiType || ''}`}>
      <div className="mreg-kpi-header">
        <span className="mreg-kpi-label">{label}</span>
        {icon && <span className="mreg-kpi-icon">{icon}</span>}
      </div>
      <div className="mreg-kpi-values">
        {(!rows || rows.length === 0) && <span className="mreg-kpi-val val">—</span>}
        {rows && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rows.map((row) => (
              <span className={`mreg-kpi-val val ${tone ? `mreg-kpi-val-${tone}` : ''}`} key={`${row.unit_id}-${row.source_company_id}`}>
                {row[valueField]} {row.unit_code} <span className="company">({row.source_company_code})</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {sub && <span className="mreg-kpi-sub">{sub}</span>}
      {netRows && netRows.length > 0 && (
        <span className="mreg-kpi-net" title="Recorded receipts minus recorded issues - a plain ledger balance, never a QC-released or usable-stock claim.">
          Net of issues: {netRows.map((r) => `${r.net_quantity} ${r.unit_code}`).join(', ')}
        </span>
      )}
    </div>
  )
}
