import './store.css'
import './MaterialsListPage.css'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import PageHero from '../../components/PageHero'
import { confirmAction } from '../../components/ConfirmProvider'
import Modal from '../inventory/components/Modal'
import AsyncSearchSelect from '../operations/AsyncSearchSelect'
import { searchActiveUnits } from '../operations/unitsLookupService'
import { getErrorMessage } from '../../utils/errors'
import Spinner from '../../components/Spinner'
import MaterialImportModal from './MaterialImportModal'
import {
  activateMaterial,
  createMaterial,
  deactivateMaterial,
  listContainerTypes,
  listMaterialCategories,
  listMaterials,
  listMaterialSuppliers,
  listMyCompanies,
  updateMaterial,
} from './storeService'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging' }
const WRITE_DENIED = 'Only an administrator can change the material catalog. You can still search and view materials.'
const STOCK_STATUS_UNAVAILABLE_REASON =
  'Not available: no reorder level or minimum-stock threshold is captured on the material catalog in this version.'
const STOCK_METRIC_UNAVAILABLE =
  'Not tracked: this catalog has no stock quantity, reorder level or unit cost fields - only receipt history does, in the register.'

// Real companies the signed-in user actually belongs to, for the hero's
// "shared across ..." line - never a hardcoded pair of names.
function companiesClause(companies) {
  const names = companies.map((c) => c.display_name || c.legal_name).filter(Boolean)
  if (names.length < 2) return ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Shared material master. The catalog is shared by both companies and the store:
// one material, one code. No stock, ownership, price or QC status lives here.
// `canManage` comes from the server's capability (`can_manage_material_catalog`).
// Without it, every write control is hidden and the list is read-only.
//
// Page structure (A-F) matches the reference layout at
// /inventory/materials: A) existing sidebar/top nav (untouched,
// rendered by the surrounding layout), B) hero banner, C) heading/
// action card, D) five summary cards, E) filter rows, F) table card
// with pagination footer - never one oversized wrapper around all of
// it. Visual source: D:\fenilrami27-CMHP-PH's CommonMaterialsTab.jsx/
// CommonInventory.css/top-banner.css (a sibling local project using
// mock Redux data) - only its presentation (CSS, hero image, column
// styling) was reused; its localStorage/mock-metric data handling was
// not, see the summary cards below.
export default function MaterialsTab({ canManage = false }) {
  // Search/type/status/page live in the URL (not local-only state) so that
  // leaving for a material's register and coming back - browser Back, or
  // the register page's own "Back to materials" link, both just pop one
  // history entry - lands on the exact same filtered/paginated list, not a
  // reset one. See setFilter() below.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const kind = searchParams.get('kind') || ''
  const status = searchParams.get('status') || ''
  const category = searchParams.get('category') || ''
  const supplier = searchParams.get('supplier') || ''
  const receiptFrom = searchParams.get('receiptFrom') || ''
  const receiptTo = searchParams.get('receiptTo') || ''
  const pageSize = Math.max(1, Number(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const hasActiveFilters = Boolean(search || kind || status || category || supplier || receiptFrom || receiptTo)
  const setFilter = (patch) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        Object.entries(patch).forEach(([key, value]) => {
          if (value === null || value === '' || value === undefined) next.delete(key)
          else next.set(key, String(value))
        })
        return next
      },
      { replace: true }
    )
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
  const [companies, setCompanies] = useState([])
  const requestRef = useRef(0)

  // Filter-dropdown options load independently of the materials list -
  // their own 403/error never blocks search/pagination, it just leaves
  // those two filters showing their "all" option only. The companies
  // lookup is purely cosmetic (hero subtitle) and never blocks anything.
  useEffect(() => {
    listMaterialCategories().then(setCategories).catch((err) => setLookupError(getErrorMessage(err)))
    listMaterialSuppliers().then(setSuppliers).catch((err) => setLookupError(getErrorMessage(err)))
    listMyCompanies().then(setCompanies).catch(() => setCompanies([]))
  }, [])

  // "+ Register Material" on the register page navigates here with
  // ?new=1 and reuses this exact Add Material modal - never a second,
  // duplicate "create master" flow. The param is stripped right away so
  // it does not reopen the modal on an unrelated later visit (e.g. the
  // Back button).
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing({ mode: 'create' })
      setFilter({ new: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    listMaterials({ search, kind, isActive: status, category, supplier, receiptFrom, receiptTo, page, pageSize })
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
  }, [search, kind, status, category, supplier, receiptFrom, receiptTo, page, pageSize, reloadKey])

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      ;['search', 'kind', 'status', 'category', 'supplier', 'receiptFrom', 'receiptTo', 'page'].forEach((key) =>
        next.delete(key)
      )
      return next
    }, { replace: true })
  }

  const reload = (message) => {
    if (message) setNotice(message)
    setReloadKey((key) => key + 1)
  }

  const toggle = async (material) => {
    const activating = !material.is_active
    const ok = await confirmAction(
      activating
        ? `Activate material ${material.code}?`
        : `Deactivate material ${material.code}? It stays in history and can be reactivated later.`,
      { confirmLabel: activating ? 'Activate' : 'Deactivate', title: activating ? 'Activate material' : 'Deactivate material', danger: !activating }
    )
    if (!ok) return
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
  }

  const totalPages = Math.max(1, Math.ceil(data.count / pageSize))
  const sharedClause = companiesClause(companies)
  const rangeStart = data.count === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, data.count)

  return (
    <div className="ci-page">
      {/* B. Hero banner - the same reusable PageHero every other page's
          hero uses (Dashboard/HRMS/Quality/Invoice), so the pharma
          background image, gradient and typography all come from the
          already-global top-banner.css rather than a one-off copy. */}
      <PageHero
        eyebrow="Common Store & Warehouse"
        title="Common Inventory"
        subtitle={`Common Store & Inventory${sharedClause ? ` — shared across ${sharedClause}.` : '.'}`}
      />

      {/* C. Heading / action card */}
      <div className="ci-header">
        <div className="ci-header-titles">
          <h2>Common Inventory – Raw Materials</h2>
          <p>Shared active pharmaceutical ingredients, excipients, solvents, and packaging supplies.</p>
          {!canManage && <p style={{ marginTop: 4, color: '#94a3b8', fontSize: 12 }}>Read-only access. Only an administrator can change the material catalog.</p>}
        </div>
        {canManage && (
          <div className="ci-header-actions">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <span aria-hidden="true">📥</span> Import CSV
            </Button>
            <Button onClick={() => setEditing({ mode: 'create' })}>+ Add Raw Material</Button>
          </div>
        )}
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {error && (
        <Alert type="error">
          {error}{' '}
          <button type="button" className="ci-row-link" onClick={() => reload()}>
            Retry
          </button>
        </Alert>
      )}
      {lookupError && <Alert type="error">Category/supplier filter options: {lookupError}</Alert>}

      {/* D. Five summary cards - only the total is a real, filtered
          count from the API; the catalog has no stock quantity,
          reorder level or unit cost anywhere, so the other four are
          honestly shown as "Not tracked" rather than a fabricated
          zero or the reference's made-up amounts. */}
      <div className="ci-summary-grid">
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>🧪</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Raw Materials</span>
            <span className="ci-card-value">{loading ? <Spinner size="xs" tone="muted" /> : data.count}</span>
            <span className="ci-card-subtext">{hasActiveFilters ? 'Matching current filters' : 'In the shared catalog'}</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>✓</div>
          <div className="ci-card-info">
            <span className="ci-card-label">In Stock</span>
            <span className="ci-card-value unsupported">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>⚠️</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Low Stock</span>
            <span className="ci-card-value unsupported">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Out of Stock</span>
            <span className="ci-card-value unsupported">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
        <div className="ci-card" title={STOCK_METRIC_UNAVAILABLE}>
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>₹</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Stock Value</span>
            <span className="ci-card-value unsupported">—</span>
            <span className="ci-card-subtext">Not tracked</span>
          </div>
        </div>
      </div>

      {/* E. Filter rows */}
      <div className="ci-filters-bar">
        <input
          className="ci-input"
          type="search"
          placeholder="Search by material code or name…"
          aria-label="Search materials"
          value={search}
          onChange={(event) => setFilter({ search: event.target.value, page: null })}
          style={{ flex: '1.5 1 240px', minWidth: 220 }}
        />
        <select className="ci-input" aria-label="Material type" value={kind} onChange={(e) => setFilter({ kind: e.target.value, page: null })} style={{ width: 150 }}>
          <option value="">All types</option>
          <option value="RAW_MATERIAL">Raw material</option>
          <option value="PACKAGING_MATERIAL">Packaging</option>
        </select>
        <select className="ci-input" aria-label="Category" value={category} onChange={(e) => setFilter({ category: e.target.value, page: null })} style={{ width: 160 }}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="ci-input" aria-label="Supplier" value={supplier} onChange={(e) => setFilter({ supplier: e.target.value, page: null })} style={{ width: 160 }}>
          <option value="">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="ci-input"
          aria-label="Stock status (not available)"
          value=""
          disabled
          title={STOCK_STATUS_UNAVAILABLE_REASON}
          onChange={() => {}}
          style={{ width: 160 }}
        >
          <option value="">All Stock Status</option>
        </select>
      </div>

      <div className="ci-filters-bar">
        <input
          className="ci-input"
          type="date"
          aria-label="Receipt activity from"
          title="Filters by when a receipt was posted for this material - not a stock-status calculation. No activity in range does not mean zero stock."
          value={receiptFrom}
          onChange={(e) => setFilter({ receiptFrom: e.target.value, page: null })}
          style={{ width: 150 }}
        />
        <span style={{ color: '#94a3b8' }}>–</span>
        <input
          className="ci-input"
          type="date"
          aria-label="Receipt activity to"
          title="Filters by when a receipt was posted for this material - not a stock-status calculation. No activity in range does not mean zero stock."
          value={receiptTo}
          onChange={(e) => setFilter({ receiptTo: e.target.value, page: null })}
          style={{ width: 150 }}
        />
        <select className="ci-input" aria-label="Page size" value={pageSize} onChange={(e) => setFilter({ pageSize: e.target.value, page: null })} style={{ width: 110 }}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
        <select className="ci-input" aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value, page: null })} style={{ width: 140 }}>
          <option value="">Active &amp; Inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        {hasActiveFilters && (
          <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
        )}
      </div>

      {/* F. Table card */}
      {!loading && !error && data.results.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No raw materials match your filters</div>
          <p className="ci-empty-desc">Try adjusting or clearing your search keywords and dropdown filters to see results.</p>
          {hasActiveFilters && <Button variant="secondary" onClick={clearFilters} style={{ marginTop: 14 }}>Clear filters</Button>}
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
                      <Link className="ci-code" to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }}>
                        {material.code}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                        {material.name}
                      </Link>
                    </td>
                    <td>{KIND_LABEL[material.kind] || material.kind}</td>
                    <td>{material.base_unit_code}</td>
                    <td>{material.default_container_type_code || '—'}</td>
                    <td>
                      <span className={`ci-badge ${material.is_active ? 'ci-badge-active' : 'ci-badge-inactive'}`}>
                        {material.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <Link className="ci-row-link" to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }}>
                        View Register
                      </Link>
                    </td>
                    {canManage && (
                      <td>
                        <div className="ci-row-actions">
                          <button type="button" className="ci-row-btn" onClick={() => setEditing({ mode: 'edit', material })}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ci-row-btn"
                            onClick={() => toggle(material)}
                            disabled={busyId === material.id}
                          >
                            {material.is_active ? 'Deactivate' : 'Activate'}
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
                Showing {rangeStart}–{rangeEnd} of {data.count} raw material{data.count === 1 ? '' : 's'}
              </span>
              <div className="ci-pagination-controls">
                <span style={{ fontSize: 13, color: '#64748b', marginRight: 4 }}>Rows:</span>
                <select className="ci-input" value={pageSize} onChange={(e) => setFilter({ pageSize: e.target.value, page: null })} style={{ height: 32, minHeight: 32, padding: '0 6px', fontSize: 12, width: 90 }}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setFilter({ page: page - 1 })}>Previous</Button>
                <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 600 }}>{page} / {totalPages}</span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setFilter({ page: page + 1 })}>Next</Button>
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
    </div>
  )
}

// A 403 means the signed-in account may read but not change the catalog.
function writeMessage(err) {
  return err?.response?.status === 403 ? WRITE_DENIED : getErrorMessage(err)
}

function MaterialFormModal({ material, onClose, onSaved }) {
  const isEdit = Boolean(material)
  const [code, setCode] = useState(material?.code || '')
  const [name, setName] = useState(material?.name || '')
  const [description, setDescription] = useState(material?.description || '')
  const [kind, setKind] = useState(material?.kind || 'RAW_MATERIAL')
  const [unit, setUnit] = useState(null)
  const [categoryId, setCategoryId] = useState(material?.category_id ?? '')
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')
  const [defaultContainerTypeId, setDefaultContainerTypeId] = useState(material?.default_container_type_id ?? '')
  const [containerTypes, setContainerTypes] = useState([])
  const [containerTypesError, setContainerTypesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    listContainerTypes()
      .then(setContainerTypes)
      .catch((err) => setContainerTypesError(getErrorMessage(err)))
    listMaterialCategories()
      .then(setCategories)
      .catch((err) => setCategoriesError(getErrorMessage(err)))
  }, [])

  const submit = async () => {
    if (busy) return
    const problems = {}
    if (!isEdit && !code.trim()) problems.code = 'Enter a material code.'
    if (!name.trim()) problems.name = 'Enter a material name.'
    if (!isEdit && !unit) problems.base_unit_id = 'Choose the base unit.'
    setFieldErrors(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setError('')
    try {
      if (isEdit) {
        const payload = { name: name.trim(), description: description.trim() }
        // Only sent when it actually changed - edits must not blindly
        // re-send every field the form happens to hold (see
        // storeWorkspace.test.jsx's "edits only name and description"
        // expectation, which this mirrors for the new fields too).
        const originalContainerId = material.default_container_type_id ?? ''
        if (String(defaultContainerTypeId) !== String(originalContainerId)) {
          payload.default_container_type_id = defaultContainerTypeId === '' ? null : Number(defaultContainerTypeId)
        }
        const originalCategoryId = material.category_id ?? ''
        if (String(categoryId) !== String(originalCategoryId)) {
          payload.category_id = categoryId === '' ? null : Number(categoryId)
        }
        await updateMaterial(material.id, payload)
        onSaved(`${material.code} saved.`)
      } else {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unit.id),
        }
        if (defaultContainerTypeId !== '') payload.default_container_type_id = Number(defaultContainerTypeId)
        if (categoryId !== '') payload.category_id = Number(categoryId)
        await createMaterial(payload)
        onSaved(`Material ${code.trim()} created.`)
      }
    } catch (err) {
      setError(writeMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${material.code}` : 'Add material'}
      onClose={busy ? () => {} : onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? 'Save changes' : 'Create material'}
          </Button>
        </>
      }
    >
      {error && <Alert type="error">{error}</Alert>}
      <div className="field">
        <label className="field-label" htmlFor="mat-code">Material code</label>
        <input id="mat-code" className="field-input" value={code} disabled={isEdit} onChange={(e) => setCode(e.target.value)} />
        {isEdit && <p className="field-muted">The code cannot be changed.</p>}
        {fieldErrors.code && <p className="field-error">{fieldErrors.code}</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mat-name">Material name</label>
        <input id="mat-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mat-kind">Type</label>
        <select id="mat-kind" className="field-input" value={kind} disabled={isEdit} onChange={(e) => setKind(e.target.value)}>
          <option value="RAW_MATERIAL">Raw material</option>
          <option value="PACKAGING_MATERIAL">Packaging</option>
        </select>
        {isEdit && <p className="field-muted">Type cannot be changed.</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mat-category">Category (optional)</label>
        <select id="mat-category" className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
          ))}
        </select>
        {categoriesError && <p className="field-error">{categoriesError}</p>}
      </div>
      <div className="field">
        <span className="field-label">Base unit</span>
        {isEdit ? (
          <p style={{ margin: 0 }}>{material.base_unit_code}</p>
        ) : (
          <>
            <AsyncSearchSelect
              id="mat-unit"
              value={unit?.id || ''}
              selected={unit}
              onChange={setUnit}
              fetchOptions={searchActiveUnits}
              getOptionLabel={(o) => o.label}
              getOptionMeta={(o) => o.meta}
              placeholder="Search active unit"
            />
            {fieldErrors.base_unit_id && <p className="field-error">{fieldErrors.base_unit_id}</p>}
          </>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mat-container">Default container type (optional)</label>
        <select
          id="mat-container"
          className="field-input"
          value={defaultContainerTypeId}
          onChange={(e) => setDefaultContainerTypeId(e.target.value)}
        >
          <option value="">None</option>
          {containerTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
          ))}
        </select>
        {containerTypesError && <p className="field-error">{containerTypesError}</p>}
        <p className="field-muted">A packaging suggestion only - never a unit conversion. The actual receipt can still record a different container.</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mat-desc">Description (optional)</label>
        <input id="mat-desc" className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  )
}
