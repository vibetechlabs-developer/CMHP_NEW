// Supplier Management — shared directory, not company-scoped.
// Full CRUD: list, create, edit (PATCH), activate, deactivate.
// Requires superuser (IsActiveSuperuser on backend).
import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner from '../../../components/Spinner'
import { useConfirmDialog } from '../../inventory/components/ConfirmDialog'
import { getErrorMessage } from '../../../utils/errors'
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  activateSupplier,
  deactivateSupplier,
  deleteSupplier,
} from '../../suppliers/suppliersService'
import '../tabs/CommonInventory.css'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  const [data, setData] = useState({ count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(null) // null | {mode:'create'} | {mode:'edit', supplierId}
  const [busyId, setBusyId] = useState(null)
  const requestRef = useRef(0)
  const { confirm, ConfirmNode } = useConfirmDialog()

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    listSuppliers({ search, isActive: status, page, pageSize })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setData({ count: result.count || 0, results: result.results || [] })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setError(getErrorMessage(err))
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false)
      })
  }, [search, status, page, pageSize, reloadKey])

  const reload = (message) => {
    if (message) setNotice(message)
    setReloadKey((k) => k + 1)
  }

  const handleToggleActive = async (supplier) => {
    const action = supplier.is_active ? 'deactivate' : 'activate'
    const ok = await confirm({
      title: `${supplier.is_active ? 'Deactivate' : 'Activate'} supplier?`,
      message: `${supplier.code} — ${supplier.legal_name} will be ${action}d.`,
      confirmLabel: supplier.is_active ? 'Yes, deactivate' : 'Yes, activate',
      variant: supplier.is_active ? 'danger' : 'primary',
    })
    if (!ok) return
    setBusyId(supplier.id)
    try {
      if (supplier.is_active) {
        await deactivateSupplier(supplier.id)
      } else {
        await activateSupplier(supplier.id)
      }
      reload(`${supplier.code} ${action}d.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (supplier) => {
    const ok = await confirm({
      title: 'Delete supplier?',
      message: `"${supplier.code} — ${supplier.legal_name}" will be permanently deleted. This cannot be undone. Suppliers linked to purchase orders cannot be deleted.`,
      confirmLabel: 'Yes, delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return
    setBusyId(supplier.id)
    try {
      await deleteSupplier(supplier.id)
      reload(`${supplier.code} deleted successfully.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.count / pageSize))
  const rangeStart = data.count === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, data.count)
  const hasActiveFilters = Boolean(search || status)

  return (
    <div className="ci-container">
      <div className="ci-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div className="ci-header-titles">
          <h2>Suppliers</h2>
          <p>Shared supplier directory — not owned by any single company.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }} />
          <Button type="button" variant="primary" onClick={() => setEditing({ mode: 'create' })}>+ Add Supplier</Button>
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {error && (
        <Alert type="error">
          {error}{' '}
          <button type="button" className="ci-row-link" onClick={() => reload()}>Retry</button>
        </Alert>
      )}

      {/* Filters */}
      <div className="inv-filters-bar">
        <input
          type="search"
          placeholder="Search by code, name or contact…"
          aria-label="Search suppliers"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="company-input"
          style={{ minWidth: 220, flex: 1.5 }}
        />
        <select className="company-input" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} style={{ width: 150 }}>
          <option value="">Active &amp; Inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <select className="company-input" aria-label="Page size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} style={{ width: 110 }}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
        {hasActiveFilters && <Button type="button" variant="secondary" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Clear filters</Button>}
      </div>

      {/* Table */}
      {!loading && !error && data.results.length === 0 ? (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🔍</div>
          <div className="ci-empty-title">No suppliers {hasActiveFilters ? 'match your filters' : 'yet'}</div>
          {!hasActiveFilters && (
            <p className="ci-empty-desc">Click "+ Add Supplier" to register your first supplier.</p>
          )}
          {hasActiveFilters && <Button type="button" variant="secondary" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Clear filters</Button>}
        </div>
      ) : (
        <div className="ci-table-card">
          <div className="ci-table-wrapper">
            <table className="ci-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Legal Name</th>
                  <th>Display Name</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="ci-code">{supplier.code}</td>
                    <td style={{ fontWeight: 600 }}>{supplier.legal_name}</td>
                    <td>{supplier.display_name || '—'}</td>
                    <td>{supplier.contact_name || '—'}</td>
                    <td>{supplier.email || '—'}</td>
                    <td>{supplier.phone || '—'}</td>
                    <td>{supplier.city || '—'}</td>
                    <td>
                      <span className={`ci-badge ${supplier.is_active ? 'ci-badge-active' : 'ci-badge-inactive'}`}>
                        {supplier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="ci-row-actions">
                        <button type="button" className="table-edit" onClick={() => setEditing({ mode: 'edit', supplierId: supplier.id })}>Edit</button>
                        <button
                          type="button"
                          className="ci-row-btn"
                          onClick={() => handleToggleActive(supplier)}
                          disabled={busyId === supplier.id}
                        >
                          {supplier.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="table-delete"
                          onClick={() => handleDelete(supplier)}
                          disabled={busyId === supplier.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loading && data.results.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '28px 0' }}>
                      <Spinner tone="brand" label="Loading suppliers…" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && data.results.length > 0 && (
            <div className="ci-pagination-bar">
              <span className="ci-pagination-info">
                Showing {rangeStart}–{rangeEnd} of {data.count} supplier{data.count === 1 ? '' : 's'}
              </span>
              <div className="ci-pagination-controls">
                <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 600 }}>{page} / {totalPages}</span>
                <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      {editing && (
        <SupplierFormModal
          supplierId={editing.mode === 'edit' ? editing.supplierId : null}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            reload(msg)
          }}
        />
      )}

      {ConfirmNode}
    </div>
  )
}


// ──────────────────────────────────────────────
// SupplierFormModal — create or edit
// ──────────────────────────────────────────────

const EMPTY_FORM = {
  code: '',
  legal_name: '',
  display_name: '',
  contact_name: '',
  email: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state_region: '',
  postal_code: '',
  country_code: '',
}

function SupplierFormModal({ supplierId, onClose, onSaved }) {
  const isEditMode = Boolean(supplierId)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [loadingData, setLoadingData] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!supplierId) return
    setLoadingData(true)
    getSupplier(supplierId)
      .then((data) => {
        setForm({
          code: data.code || '',
          legal_name: data.legal_name || '',
          display_name: data.display_name || '',
          contact_name: data.contact_name || '',
          email: data.email || '',
          phone: data.phone || '',
          address_line_1: data.address_line_1 || '',
          address_line_2: data.address_line_2 || '',
          city: data.city || '',
          state_region: data.state_region || '',
          postal_code: data.postal_code || '',
          country_code: data.country_code || '',
        })
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoadingData(false))
  }, [supplierId])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setError('')
    setFieldErrors({})

    // Client-side validation
    const errs = {}
    if (!isEditMode && !form.code.trim()) errs.code = 'Code is required.'
    if (!form.legal_name.trim()) errs.legal_name = 'Legal name is required.'
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    setSaving(true)
    try {
      if (isEditMode) {
        // PATCH — only send changed fields (code is immutable)
        const payload = {}
        Object.keys(EMPTY_FORM).forEach((key) => {
          if (key === 'code') return // immutable
          payload[key] = form[key].trim()
        })
        await updateSupplier(supplierId, payload)
        onSaved('Supplier updated.')
      } else {
        const payload = {}
        Object.keys(EMPTY_FORM).forEach((key) => {
          const val = form[key].trim()
          if (val) payload[key] = val
        })
        await createSupplier(payload)
        onSaved('Supplier created.')
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      // If field-level errors from backend
      if (err?.response?.data && typeof err.response.data === 'object') {
        const fe = {}
        Object.entries(err.response.data).forEach(([k, v]) => {
          fe[k] = Array.isArray(v) ? v.join(' ') : String(v)
        })
        if (Object.keys(fe).length > 0) setFieldErrors(fe)
      }
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  // Use the app's themed modal backdrop
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 className="modal-title">{isEditMode ? 'Edit supplier' : 'New supplier'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {loadingData ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spinner tone="brand" label="Loading supplier…" />
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Row 1: Code + Legal Name */}
              <div className="field">
                <label className="field-label" htmlFor="sf-code">Code *</label>
                <input id="sf-code" className="field-input" value={form.code} onChange={(e) => updateField('code', e.target.value)} disabled={isEditMode} placeholder="e.g. SUP-001" />
                {fieldErrors.code && <span className="field-error">{fieldErrors.code}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sf-legal-name">Legal Name *</label>
                <input id="sf-legal-name" className="field-input" value={form.legal_name} onChange={(e) => updateField('legal_name', e.target.value)} placeholder="Full legal name" />
                {fieldErrors.legal_name && <span className="field-error">{fieldErrors.legal_name}</span>}
              </div>

              {/* Row 2: Display Name + Contact */}
              <div className="field">
                <label className="field-label" htmlFor="sf-display-name">Display Name</label>
                <input id="sf-display-name" className="field-input" value={form.display_name} onChange={(e) => updateField('display_name', e.target.value)} placeholder="Short/trade name" />
                {fieldErrors.display_name && <span className="field-error">{fieldErrors.display_name}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sf-contact">Contact Person</label>
                <input id="sf-contact" className="field-input" value={form.contact_name} onChange={(e) => updateField('contact_name', e.target.value)} placeholder="Primary contact" />
                {fieldErrors.contact_name && <span className="field-error">{fieldErrors.contact_name}</span>}
              </div>

              {/* Row 3: Email + Phone */}
              <div className="field">
                <label className="field-label" htmlFor="sf-email">Email</label>
                <input id="sf-email" className="field-input" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="supplier@example.com" />
                {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sf-phone">Phone</label>
                <input id="sf-phone" className="field-input" type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="e.g. +91 9876543210" />
                {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
              </div>

              {/* Row 4: Address */}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="sf-addr1">Address Line 1</label>
                <input id="sf-addr1" className="field-input" value={form.address_line_1} onChange={(e) => updateField('address_line_1', e.target.value)} placeholder="Street, building" />
                {fieldErrors.address_line_1 && <span className="field-error">{fieldErrors.address_line_1}</span>}
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="sf-addr2">Address Line 2</label>
                <input id="sf-addr2" className="field-input" value={form.address_line_2} onChange={(e) => updateField('address_line_2', e.target.value)} placeholder="Area, landmark" />
                {fieldErrors.address_line_2 && <span className="field-error">{fieldErrors.address_line_2}</span>}
              </div>

              {/* Row 5: City + State */}
              <div className="field">
                <label className="field-label" htmlFor="sf-city">City</label>
                <input id="sf-city" className="field-input" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="e.g. Mumbai" />
                {fieldErrors.city && <span className="field-error">{fieldErrors.city}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sf-state">State / Region</label>
                <input id="sf-state" className="field-input" value={form.state_region} onChange={(e) => updateField('state_region', e.target.value)} placeholder="e.g. Maharashtra" />
                {fieldErrors.state_region && <span className="field-error">{fieldErrors.state_region}</span>}
              </div>

              {/* Row 6: Postal + Country */}
              <div className="field">
                <label className="field-label" htmlFor="sf-postal">Postal Code</label>
                <input id="sf-postal" className="field-input" value={form.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} placeholder="e.g. 400001" />
                {fieldErrors.postal_code && <span className="field-error">{fieldErrors.postal_code}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sf-country">Country Code</label>
                <input id="sf-country" className="field-input" value={form.country_code} onChange={(e) => updateField('country_code', e.target.value)} placeholder="e.g. IN" maxLength={2} style={{ textTransform: 'uppercase' }} />
                {fieldErrors.country_code && <span className="field-error">{fieldErrors.country_code}</span>}
              </div>

              {error && <p className="field-error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
            </div>

            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                {isEditMode ? 'Save supplier' : 'Create supplier'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
