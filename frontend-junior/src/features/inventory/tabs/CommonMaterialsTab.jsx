// Real shared material catalog - replaces the mock Redux-backed
// (state.erp.commonRawMaterials) implementation with the tested real
// backend integration already proven in frontend/src/features/store/
// MaterialsTab.jsx. Presentation (hero/header card/summary cards/filters/
// table styling, all ci-* classes) is this screen's own and is kept
// unchanged; only the data source and the table's required columns
// change. The catalog has no stock quantity, reorder level or unit cost
// fields anywhere on the backend, so those four summary cards are shown
// as an honest "Not tracked" instead of the old mock numbers - never a
// fabricated zero.
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Spinner from '../../../components/Spinner'
import Modal from '../components/Modal'
import useAuth from '../../../hooks/useAuth'
import { getErrorMessage } from '../../../utils/errors'
import MaterialImportModal from '../../store/MaterialImportModal'
import {
  activateMaterial,
  createMaterial,
  deactivateMaterial,
  deleteMaterial,
  getMaterialReorderSetting,
  getMyStores,
  listContainerTypes,
  listMaterialCategories,
  listMaterials,
  listMaterialSuppliers,
  listUnits,
  setMaterialReorderLevel,
  updateMaterial,
} from '../../store/storeService'
import './CommonInventory.css'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const KIND_LABEL = {
  RAW_MATERIAL: 'Raw material',
  PACKAGING_MATERIAL: 'Packaging',
  MOTHER_TINCTURE: 'Mother Tincture',
}
const WRITE_DENIED = 'Only an administrator can change the material catalog. You can still search and view materials.'
const STOCK_METRIC_UNAVAILABLE =
  'Not tracked: this catalog has no stock quantity, reorder level or unit cost fields - only receipt history does, once the register is wired up.'
const STOCK_STATUS_UNAVAILABLE_REASON =
  'Not available: stock status needs an authoritative balance and reorder level for ONE store - this list is the shared, store-independent catalog. Open a material’s register (a real store) to see its actual balance.'

const DEMO_UNIT_CODES = new Set(['DEMOBTL', 'DEMOKG', 'DEMOMG', 'DEMOMKG'])

function writeMessage(err) {
  return err?.response?.status === 403 ? WRITE_DENIED : getErrorMessage(err)
}

export default function CommonMaterialsTab() {
  const { user } = useAuth()
  const canManage = user?.capabilities?.can_manage_material_catalog === true

  // Search/type/status/page live in the URL so leaving for a material's
  // register and coming back (browser Back) lands on the same filtered,
  // paginated list instead of a reset one.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const kind = searchParams.get('kind') || ''
  const status = searchParams.get('status') || ''

  const supplier = searchParams.get('supplier') || ''
  const receiptFrom = searchParams.get('receiptFrom') || ''
  const receiptTo = searchParams.get('receiptTo') || ''
  const pageSize = Math.max(1, Number(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const hasActiveFilters = Boolean(search || kind || status || supplier || receiptFrom || receiptTo)

  const setFilter = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === '' || value === undefined) next.delete(key)
        else next.set(key, String(value))
      })
      return next
    }, { replace: true })
  }

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      ;['search', 'kind', 'status', 'supplier', 'receiptFrom', 'receiptTo', 'page'].forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }

  const [data, setData] = useState({ count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(null) // null | {mode:'create'} | {mode:'edit', material}
  const [importing, setImporting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [lookupError, setLookupError] = useState('')
  const requestRef = useRef(0)

  // Themed confirmation dialog state (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState(null)
  // confirmDialog shape: { title, message, variant, onConfirm, confirmLabel, busy }

  // Filter-dropdown options load independently of the materials list -
  // their own error never blocks search/pagination.
  useEffect(() => {
    listMaterialCategories().then(setCategories).catch((err) => setLookupError(getErrorMessage(err)))
    listMaterialSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    listMaterials({ search, kind, isActive: status, supplier, receiptFrom, receiptTo, page, pageSize })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setData(result)
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setError(getErrorMessage(err))
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false)
      })
  }, [search, kind, status, supplier, receiptFrom, receiptTo, page, pageSize, reloadKey])

  const reload = (message) => {
    if (message) setNotice(message)
    setReloadKey((key) => key + 1)
  }

  // Exports every row matching the CURRENT filters, across every page -
  // never just the loaded page, and never hidden commercial data (this
  // catalog has none - no cost/price field exists on Material at all).
  // Bounded to a safety cap so a runaway filter can never hang the
  // browser fetching an unbounded result.
  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      const EXPORT_PAGE_SIZE = 200
      const EXPORT_MAX_PAGES = 25 // 5,000 rows - a generous, explicit cap, never silent truncation without saying so
      let allRows = []
      let exportedPage = 1
      let totalCount = 0
      for (; exportedPage <= EXPORT_MAX_PAGES; exportedPage += 1) {
        const result = await listMaterials({
          search, kind, isActive: status, supplier, receiptFrom, receiptTo,
          page: exportedPage, pageSize: EXPORT_PAGE_SIZE,
        })
        totalCount = result.count
        allRows = allRows.concat(result.results)
        if (allRows.length >= result.count) break
      }
      const truncated = allRows.length < totalCount
      const headers = ['Material Code', 'Material Name', 'Type', 'Base Unit', 'Default Container', 'Status']
      const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const lines = [
        hasActiveFilters ? 'Coverage: all materials matching the current filters.' : 'Coverage: all materials in the shared catalog.',
        truncated ? `Truncated to the first ${allRows.length} of ${totalCount} matching materials (export cap reached).` : '',
        '',
        headers.map(csvEscape).join(','),
        ...allRows.map((m) => [
          m.code, m.name, KIND_LABEL[m.kind] || m.kind, m.base_unit_code, m.default_container_type_code || '', m.is_active ? 'Active' : 'Inactive',
        ].map(csvEscape).join(',')),
      ].filter(Boolean)
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'materials.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const showConfirm = (opts) => setConfirmDialog({ ...opts, busy: false })
  const closeConfirm = () => setConfirmDialog(null)

  const runConfirm = async () => {
    if (!confirmDialog?.onConfirm) return
    setConfirmDialog((d) => ({ ...d, busy: true }))
    try {
      await confirmDialog.onConfirm()
    } finally {
      setConfirmDialog(null)
    }
  }

  const toggle = (material) => {
    const activating = !material.is_active
    showConfirm({
      title: activating ? 'Activate Material' : 'Deactivate Material',
      message: activating
        ? `Activate material "${material.code}"? It will become available for use.`
        : `Deactivate "${material.code}"? It stays in history and can be reactivated later.`,
      variant: activating ? 'primary' : 'warning',
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      onConfirm: async () => {
        setBusyId(material.id)
        try {
          if (activating) await activateMaterial(material.id)
          else await deactivateMaterial(material.id)
          reload(`${material.code} ${activating ? 'activated' : 'deactivated'}.`)
        } catch (err) {
          setError(writeMessage(err))
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const handleDelete = (material) => {
    showConfirm({
      title: 'Delete Material',
      message: `Permanently delete "${material.code} – ${material.name}"? This cannot be undone. Materials linked to stock movements or orders cannot be deleted.`,
      variant: 'danger',
      confirmLabel: 'Delete permanently',
      onConfirm: async () => {
        setBusyId(material.id)
        try {
          await deleteMaterial(material.id)
          reload(`${material.code} deleted.`)
        } catch (err) {
          setError(writeMessage(err))
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const totalPages = Math.max(1, Math.ceil(data.count / pageSize))
  const rangeStart = data.count === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, data.count)

  return (
    <div className="ci-container">
      {/* 1. Header Toolbar */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Material Master</h2>
          <p>Shared active pharmaceutical ingredients, excipients, solvents, and packaging supplies.</p>
          {!canManage && <p style={{ marginTop: 4, color: '#94a3b8', fontSize: 12 }}>Read-only access. Only an administrator can change the material catalog.</p>}
        </div>
        <div className="ci-header-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={exportCsv}
            loading={exporting}
            disabled={exporting || data.count === 0}
            title={hasActiveFilters ? 'Exports every material matching the current filters (all pages), as CSV.' : 'Exports every material in the catalog, as CSV.'}
          >
            <span aria-hidden="true">📤</span> Export CSV ({hasActiveFilters ? 'filtered' : 'all'})
          </Button>
          {canManage && (
            <>
              <Button type="button" variant="secondary" onClick={() => setImporting(true)}>
                <span aria-hidden="true">📥</span> Import CSV
              </Button>
              <Button type="button" variant="primary" onClick={() => setEditing({ mode: 'create' })}>
                + Add Material
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {error && (
        <Alert type="error">
          {error}{' '}
          <button type="button" className="ci-row-link" onClick={() => reload()}>Retry</button>
        </Alert>
      )}
      {lookupError && <Alert type="error">Category/supplier filter options: {lookupError}</Alert>}

      {/* 2. Summary Cards - only the total is real; the catalog has no
          stock/reorder/cost fields, so those are honestly "Not tracked". */}
      <div className="ci-summary-grid">
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>🧪</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Materials</span>
            <span className="ci-card-value">{loading ? <Spinner size="xs" tone="muted" /> : data.count}</span>
            <span className="ci-card-subtext">{hasActiveFilters ? 'Matching current filters' : 'In the shared catalog'}</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>✓</div>
          <div className="ci-card-info">
            <span className="ci-card-label">In Stock</span>
            <span className="ci-card-value">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>⚠️</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Low Stock</span>
            <span className="ci-card-value">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Out of Stock</span>
            <span className="ci-card-value">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>₹</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Stock Value</span>
            <span className="ci-card-value">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Panel */}
      <div className="mm-filter-panel">
        {/* Row 1: Search + dropdowns */}
        <div className="mm-filter-row">
          <div className="mm-filter-field mm-filter-search">
            <label className="mm-filter-label">Search</label>
            <input
              type="search"
              placeholder="Search by material code or name…"
              aria-label="Search materials"
              value={search}
              onChange={(e) => setFilter({ search: e.target.value, page: null })}
              className="company-input mm-input-full"
            />
          </div>
          <div className="mm-filter-field">
            <label className="mm-filter-label">Type</label>
            <select className="company-input mm-input-full" aria-label="Material type" value={kind} onChange={(e) => setFilter({ kind: e.target.value, page: null })}>
              <option value="">All types</option>
              <option value="RAW_MATERIAL">Raw material</option>
              <option value="PACKAGING_MATERIAL">Packaging</option>
              <option value="MOTHER_TINCTURE">Mother Tincture</option>
            </select>
          </div>

          <div className="mm-filter-field">
            <label className="mm-filter-label">Supplier</label>
            <select className="company-input mm-input-full" aria-label="Supplier" value={supplier} onChange={(e) => setFilter({ supplier: e.target.value, page: null })}>
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.display_name || s.legal_name || s.code}</option>
              ))}
            </select>
            <select
              aria-label="Stock status (not available)"
              value=""
              disabled
              title={STOCK_STATUS_UNAVAILABLE_REASON}
              style={{ display: 'none' }}
              readOnly
            >
              <option value="">All Stock Status</option>
            </select>
          </div>
        </div>

        {/* Row 2: Status + Rows/page + Receipt activity + Clear filters */}
        <div className="mm-filter-row mm-filter-row-secondary">
          <div className="mm-filter-field">
            <label className="mm-filter-label">Status</label>
            <select className="company-input mm-input-full" aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value, page: null })}>
              <option value="">Active &amp; Inactive</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>
          <div className="mm-filter-field">
            <label className="mm-filter-label">Rows / page</label>
            <select className="company-input mm-input-full" aria-label="Page size" value={pageSize} onChange={(e) => setFilter({ pageSize: e.target.value, page: null })}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
          </div>
          <div className="mm-filter-date-group">
            <label htmlFor="mat-receipt-from" className="mm-filter-label">Receipt activity</label>
            <div className="mm-date-range">
              <input
                id="mat-receipt-from"
                type="date"
                aria-label="Receipt activity from"
                title="Filters by when a receipt was posted for this material - not a stock-status calculation. No activity in range does not mean zero stock."
                value={receiptFrom}
                onChange={(e) => setFilter({ receiptFrom: e.target.value, page: null })}
                className="company-input"
              />
              <span className="mm-date-sep">–</span>
              <input
                type="date"
                aria-label="Receipt activity to"
                title="Filters by when a receipt was posted for this material - not a stock-status calculation. No activity in range does not mean zero stock."
                value={receiptTo}
                onChange={(e) => setFilter({ receiptTo: e.target.value, page: null })}
                className="company-input"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mm-filter-clear">
              <Button type="button" variant="secondary" onClick={clearFilters}>✕ Clear filters</Button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Table / Empty States */}
      {!loading && !error && data.results.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No materials match your filters</div>
          <p className="ci-empty-desc">Try adjusting or clearing your search keywords and dropdown filters to see results.</p>
          {hasActiveFilters && <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        </div>
      ) : (
        <div className="ci-table-card">
          <div className="ci-table-wrapper">
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Type</th>
                  <th>Base Unit</th>
                  <th>Alcohol %</th>
                  <th>Default Container</th>
                  <th>Status</th>
                  <th>Register</th>
                  {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.results.map((material) => (
                  <tr key={material.id}>
                    <td>
                      <Link className="ci-code" to={`/inventory/materials/${material.id}`} state={{ material, returnSearch: searchParams.toString() }}>
                        {material.code}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/inventory/materials/${material.id}`} state={{ material, returnSearch: searchParams.toString() }} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                        {material.name}
                      </Link>
                    </td>
                    <td>{KIND_LABEL[material.kind] || material.kind}</td>
                    <td>{material.base_unit_code}</td>
                    <td>
                      {Number(material.alcohol_percentage) > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          ⚗️ {Number(material.alcohol_percentage).toFixed(2)}%
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>{material.default_container_type_code || '—'}</td>
                    <td>
                      <span className={`ci-badge ${material.is_active ? 'ci-badge-active' : 'ci-badge-inactive'}`}>
                        {material.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <Link className="ci-row-link" to={`/inventory/materials/${material.id}`} state={{ material, returnSearch: searchParams.toString() }}>
                        View Register
                      </Link>
                    </td>
                    {canManage && (
                      <td>
                        <div className="ci-row-actions">
                          <button type="button" className="table-edit" onClick={() => setEditing({ mode: 'edit', material })} disabled={busyId === material.id}>
                            Edit
                          </button>
                          <button type="button" className="ci-row-btn" onClick={() => toggle(material)} disabled={busyId === material.id}>
                            {material.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" className="table-delete" onClick={() => handleDelete(material)} disabled={busyId === material.id}>
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {loading && data.results.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', padding: '28px 0' }}>
                      <Spinner tone="brand" label="Loading materials…" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && data.results.length > 0 && (
            <div className="ci-pagination-bar">
              <span className="ci-pagination-info">
                Showing {rangeStart}–{rangeEnd} of {data.count} material{data.count === 1 ? '' : 's'}
              </span>
              <div className="ci-pagination-controls">
                <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setFilter({ page: page - 1 })}>← Previous</Button>
                <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 600 }}>{page} / {totalPages}</span>
                <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setFilter({ page: page + 1 })}>Next →</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && editing && (
        <MaterialFormModal
          material={editing.mode === 'edit' ? editing.material : null}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            reload(message)
          }}
        />
      )}

      {canManage && importing && (
        <MaterialImportModal
          onClose={() => setImporting(false)}
          onImported={(count) => {
            setImporting(false)
            reload(`${count} material${count === 1 ? '' : 's'} imported. This imports material definitions only; it does not add stock.`)
          }}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          busy={confirmDialog.busy}
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  )
}

// =========================================================
//  THEMED CONFIRM DIALOG
//  Replaces window.confirm() with a modal that matches the
//  existing inv-modal design system.
// =========================================================
function ConfirmDialog({ title, message, variant = 'primary', confirmLabel = 'Confirm', busy = false, onConfirm, onCancel }) {
  const variantConfig = {
    primary:  { icon: 'ℹ️',  btnClass: 'btn btn-primary',  headerBg: 'linear-gradient(135deg,#edf7fc,#fbfdff)', headerBorder: '#dfe9ef' },
    warning:  { icon: '⚠️', btnClass: 'btn btn-warning',  headerBg: 'linear-gradient(135deg,#fffbeb,#fffdf5)', headerBorder: '#fde68a' },
    danger:   { icon: '🗑️',  btnClass: 'btn btn-danger',   headerBg: 'linear-gradient(135deg,#fff1f3,#fffafa)', headerBorder: '#fecaca' },
  }
  const cfg = variantConfig[variant] || variantConfig.primary

  return (
    <div className="inv-modal-overlay" onClick={busy ? undefined : onCancel} role="dialog" aria-modal="true" aria-labelledby="cdlg-title">
      <div
        className="inv-modal"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="inv-modal-header" style={{ background: cfg.headerBg, borderBottom: `1px solid ${cfg.headerBorder}` }}>
          <h3 id="cdlg-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#163b59', fontSize: 15, fontWeight: 800 }}>
            <span aria-hidden="true">{cfg.icon}</span>
            {title}
          </h3>
          <button type="button" className="inv-modal-close" onClick={onCancel} disabled={busy} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="inv-modal-body">
          <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>{message}</p>
        </div>

        {/* Footer */}
        <div className="inv-modal-footer" style={{ gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={cfg.btnClass} onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
function MaterialFormModal({ material, onClose, onSaved }) {
  const isEdit = Boolean(material)
  const [code, setCode] = useState(material?.code || '')
  const [name, setName] = useState(material?.name || '')
  const [description, setDescription] = useState(material?.description || '')
  const [kind, setKind] = useState(material?.kind || 'RAW_MATERIAL')
  const [unitId, setUnitId] = useState(material?.base_unit_id ? String(material.base_unit_id) : '')
  const [units, setUnits] = useState([])
  const [unitsError, setUnitsError] = useState('')
  const [defaultContainerTypeId, setDefaultContainerTypeId] = useState(material?.default_container_type_id ?? '')
  const [containerTypes, setContainerTypes] = useState([])
  const [containerTypesError, setContainerTypesError] = useState('')
  const [categoryId, setCategoryId] = useState(material?.category_id ? String(material.category_id) : '')
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')
  const [alcoholPercentage, setAlcoholPercentage] = useState(
    material?.alcohol_percentage != null ? String(material.alcohol_percentage) : ''
  )
  const [createReorderLevel, setCreateReorderLevel] = useState('')
  const [createStoreList, setCreateStoreList] = useState([])
  const [createStoreId, setCreateStoreId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    listUnits()
      .then((res) => {
        const filtered = (res || []).filter(
          (u) => !DEMO_UNIT_CODES.has(u.code) && !u.code?.startsWith('DEMO')
        )
        setUnits(filtered)
        if (material?.base_unit_code) {
          const match = filtered.find(
            (u) => u.code === material.base_unit_code || u.id === material.base_unit_id
          )
          if (match) setUnitId(String(match.id))
        }
      })
      .catch((err) => setUnitsError(getErrorMessage(err)))

    listContainerTypes()
      .then(setContainerTypes)
      .catch((err) => setContainerTypesError(getErrorMessage(err)))

    listMaterialCategories()
      .then(setCategories)
      .catch((err) => setCategoriesError(getErrorMessage(err)))

    if (!isEdit && typeof getMyStores === 'function') {
      try {
        const p = getMyStores()
        if (p && typeof p.then === 'function') {
          p.then((list) => {
            setCreateStoreList(list || [])
            if (list?.length === 1) setCreateStoreId(list[0].id)
          }).catch(() => {})
        }
      } catch {}
    }
  }, [material, isEdit])

  const submit = async () => {
    if (busy) return
    const problems = {}
    if (!code.trim()) problems.code = 'Enter a material code.'
    if (!name.trim()) problems.name = 'Enter a material name.'
    if (!unitId) problems.base_unit_id = 'Choose the base unit.'
    if (alcoholPercentage.trim() !== '') {
      const alcNum = Number(alcoholPercentage)
      if (Number.isNaN(alcNum) || alcNum < 0 || alcNum > 100) {
        problems.alcohol_percentage = 'Alcohol percentage must be a number between 0 and 100.'
      }
    }
    setFieldErrors(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setError('')
    try {
      const alcVal = alcoholPercentage.trim() !== '' ? Number(alcoholPercentage) : 0
      if (isEdit) {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unitId),
          alcohol_percentage: alcVal,
        }
        const originalContainerId = material.default_container_type_id ?? ''
        if (String(defaultContainerTypeId) !== String(originalContainerId)) {
          payload.default_container_type_id = defaultContainerTypeId === '' ? null : Number(defaultContainerTypeId)
        }
        const originalCategoryId = material.category_id ?? ''
        if (String(categoryId) !== String(originalCategoryId)) {
          payload.category_id = categoryId === '' ? null : Number(categoryId)
        }
        await updateMaterial(material.id, payload)
        onSaved(`${code.trim()} saved.`)
      } else {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unitId),
          alcohol_percentage: alcVal,
        }
        if (defaultContainerTypeId !== '') payload.default_container_type_id = Number(defaultContainerTypeId)
        if (categoryId !== '') payload.category_id = Number(categoryId)
        const createdMat = await createMaterial(payload)
        if (createReorderLevel !== '' && createStoreId) {
          const num = Number(createReorderLevel)
          if (!Number.isNaN(num) && num >= 0) {
            try {
              await setMaterialReorderLevel(createStoreId, createdMat.id, createReorderLevel)
            } catch (reorderErr) {
              console.warn('Could not set initial reorder level:', reorderErr)
            }
          }
        }
        onSaved(`Material ${code.trim()} created.`)
      }
    } catch (err) {
      setError(writeMessage(err))
    } finally {
      setBusy(false)
    }
  }
  // Mother Tincture is its own material type — category is irrelevant for it.
  const filteredCategories = kind === 'MOTHER_TINCTURE'
    ? []
    : categories.filter(
        (c) => !c.code?.toLowerCase().includes('mother') && !c.name?.toLowerCase().includes('mother')
      )

  return (
    <Modal
      title={isEdit ? `Edit ${material.code}` : 'Add Material'}
      onClose={busy ? () => {} : onClose}
      maxWidth="620px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? 'Save changes' : 'Create material'}
          </Button>
        </>
      }
    >
      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div className="inv-modal-form">
        {/* Row 1: Code + Type side-by-side */}
        <div className="inv-modal-form-row">
          <div className="company-field">
            <label className="inv-modal-field-label">Material code</label>
            <input
              className="company-input"
              placeholder="e.g. RM-001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {fieldErrors.code && <p className="field-error">{fieldErrors.code}</p>}
          </div>

          <div className="company-field">
            <label className="inv-modal-field-label">Type</label>
            <select className="company-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="RAW_MATERIAL">Raw material</option>
              <option value="PACKAGING_MATERIAL">Packaging</option>
              <option value="MOTHER_TINCTURE">Mother Tincture</option>
            </select>
          </div>
        </div>

        {/* Optional Category dropdown — hidden for Mother Tincture (it is its own type) */}
        {filteredCategories.length > 0 && (
          <div className="company-field">
            <label className="inv-modal-field-label">
              Category <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: '#7a96aa' }}>(optional, e.g. Herbs, Excipients)</span>
            </label>
            <select
              className="company-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">None</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
            {categoriesError && <p className="field-error">{categoriesError}</p>}
          </div>
        )}

        {/* Row 2: Name (full width) */}
        <div className="company-field">
          <label className="inv-modal-field-label">Material name</label>
          <input
            className="company-input"
            placeholder="Full descriptive name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
        </div>

        {/* Row 3: Base unit + Default container type side-by-side */}
        <div className="inv-modal-form-row">
          <div className="company-field">
            <label className="inv-modal-field-label">Base unit</label>
            <select className="company-input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Choose a unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
              ))}
            </select>
            {unitsError && <p className="field-error">{unitsError}</p>}
            {fieldErrors.base_unit_id && <p className="field-error">{fieldErrors.base_unit_id}</p>}
          </div>

          <div className="company-field">
            <label className="inv-modal-field-label">
              Default container type <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: '#7a96aa' }}>(optional)</span>
            </label>
            <select className="company-input" value={defaultContainerTypeId} onChange={(e) => setDefaultContainerTypeId(e.target.value)}>
              <option value="">None</option>
              {containerTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
              ))}
            </select>
            {containerTypesError && <p className="field-error">{containerTypesError}</p>}
            <p className="inv-modal-hint">Packaging suggestion only — not a unit conversion.</p>
          </div>
        </div>

        {/* Row: Alcohol Content % (Only for Raw Materials and Mother Tinctures) */}
        {(kind === 'RAW_MATERIAL' || kind === 'MOTHER_TINCTURE') && (
          <div className="company-field" style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
            <label className="inv-modal-field-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>⚗️ Alcohol Content (%) <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: '#7a96aa' }}>(optional)</span></span>
              <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>C₁·V₁ = C₂·V₂ Batch Deduction</span>
            </label>
            <div style={{ position: 'relative', maxWidth: 220, marginTop: 4 }}>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="company-input"
                style={{ paddingRight: 45, fontWeight: 700 }}
                placeholder="e.g. 60.00"
                value={alcoholPercentage}
                onChange={(e) => setAlcoholPercentage(e.target.value)}
              />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                % v/v
              </span>
            </div>
            {fieldErrors.alcohol_percentage && <p className="field-error">{fieldErrors.alcohol_percentage}</p>}
            <p className="inv-modal-hint" style={{ marginTop: 4, color: '#475569' }}>
              Alcohol percentage in this raw material. If this material contains alcohol, it will be automatically converted and deducted from the pure dispensing alcohol (ENA/RS) in production formulas.
            </p>
          </div>
        )}

        {/* Row 4: Description (full width) */}
        <div className="company-field">
          <label className="inv-modal-field-label">
            Description <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: '#7a96aa' }}>(optional)</span>
          </label>
          <input
            className="company-input"
            placeholder="Brief description or notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {!isEdit && (
          <div className="company-field" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4 }}>
            <label className="inv-modal-field-label">
              Low Stock Alert Threshold <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11, color: '#7a96aa' }}>(optional — admin can also set this later from Edit Material)</span>
            </label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
              When this store's stock falls to or below this quantity, a 🔔 low stock notification will appear in the notification bell and the dashboard. Leave blank to skip for now.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {createStoreList.length > 1 ? (
                <select
                  className="company-input"
                  value={createStoreId ?? ''}
                  onChange={(e) => setCreateStoreId(e.target.value ? Number(e.target.value) : null)}
                  style={{ flex: 1 }}
                >
                  <option value="">Choose store</option>
                  {createStoreList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              ) : (
                createStoreList.length === 1 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155', minWidth: '120px' }}>
                    {createStoreList[0].name}
                  </span>
                )
              )}
              <input
                type="number"
                step="any"
                min="0"
                className="company-input"
                placeholder="e.g. 10.000"
                value={createReorderLevel}
                onChange={(e) => setCreateReorderLevel(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        )}

        {isEdit && <ReorderLevelSection materialId={material.id} baseUnitCode={material.base_unit_code} />}
      </div>
    </Modal>
  )
}

// Store-scoped reorder level (apps.catalog.MaterialReorderSetting) -
// NEVER a field on the shared material itself (see that model's own
// docstring: the catalog has no store context, so "below reorder level"
// only ever means something at one specific store). Shown and saved
// independently of the main Save Changes button above since it is a
// genuinely separate API call, scoped to whichever store is selected
// here - the selected store is always named plainly next to the value,
// never implied.
function ReorderLevelSection({ materialId, baseUnitCode }) {
  const [stores, setStores] = useState({ status: 'loading', list: [], error: '' })
  const [storeId, setStoreId] = useState(null)
  const [setting, setSetting] = useState({ status: 'idle', reorderLevel: null, error: '' })
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')

  useEffect(() => {
    getMyStores()
      .then((list) => {
        setStores({ status: 'ready', list, error: '' })
        if (list.length === 1) setStoreId(list[0].id)
      })
      .catch((err) => setStores({ status: 'error', list: [], error: getErrorMessage(err) }))
  }, [])

  useEffect(() => {
    if (!storeId) return
    setSetting({ status: 'loading', reorderLevel: null, error: '' })
    setSaveNotice('')
    getMaterialReorderSetting(storeId, materialId)
      .then((data) => {
        setSetting({ status: 'ready', reorderLevel: data.reorder_level, error: '' })
        setDraft(data.reorder_level ?? '')
      })
      .catch((err) => setSetting({ status: 'error', reorderLevel: null, error: getErrorMessage(err) }))
  }, [storeId, materialId])

  const save = async () => {
    if (saving || !storeId) return
    const value = Number(draft)
    if (draft === '' || Number.isNaN(value) || value < 0) {
      setSaveError('Enter a non-negative reorder level.')
      return
    }
    setSaving(true)
    setSaveError('')
    setSaveNotice('')
    try {
      const saved = await setMaterialReorderLevel(storeId, materialId, draft)
      setSetting({ status: 'ready', reorderLevel: saved.reorder_level, error: '' })
      setSaveNotice('Reorder level saved for this store.')
    } catch (err) {
      setSaveError(err?.response?.status === 403 ? 'You do not have permission to set this store’s reorder level.' : getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const selectedStore = stores.list.find((s) => s.id === storeId)

  return (
    <div className="company-field" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4 }}>
      <label>Reorder level (optional, store-specific)</label>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
        This catalog is shared across every store - a reorder threshold only ever applies to ONE store's own stock,
        never globally. Choose the store it applies to below.
      </p>

      {stores.status === 'loading' && <Spinner size="xs" tone="muted" label="Loading your stores…" />}
      {stores.status === 'error' && <p className="field-error">{stores.error}</p>}
      {stores.status === 'ready' && stores.list.length === 0 && (
        <p style={{ fontSize: 12, color: '#94a3b8' }}>No store is available to your account.</p>
      )}

      {stores.status === 'ready' && stores.list.length > 0 && (
        <>
          {stores.list.length > 1 ? (
            <select className="company-input" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} style={{ marginBottom: 8 }}>
              <option value="">Choose a store</option>
              {stores.list.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          ) : (
            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>Store: {selectedStore?.name} ({selectedStore?.code})</p>
          )}

          {storeId && (
            <>
              {selectedStore && stores.list.length > 1 && (
                <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>Editing for: {selectedStore.name} ({selectedStore.code})</p>
              )}
              {setting.status === 'loading' && <Spinner size="xs" tone="muted" label="Loading current reorder level…" />}
              {setting.status === 'error' && <p className="field-error">{setting.error}</p>}
              {setting.status === 'ready' && (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="company-input"
                      type="number"
                      min="0"
                      step="any"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      style={{ maxWidth: 140 }}
                      placeholder="Not configured"
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>{baseUnitCode}</span>
                    <Button type="button" variant="secondary" onClick={save} loading={saving} disabled={saving}>
                      Save reorder level
                    </Button>
                  </div>
                  {setting.reorderLevel === null && (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>Not configured for this store yet.</p>
                  )}
                  {saveError && <p className="field-error">{saveError}</p>}
                  {saveNotice && <p style={{ fontSize: 12, color: '#16a34a', margin: '6px 0 0' }}>{saveNotice}</p>}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
