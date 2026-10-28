import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner from '../../../components/Spinner'
import Modal from '../../inventory/components/Modal'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import { activateUnit, createUnit, deactivateUnit, listUnitsAdmin, updateUnit } from '../organizationSetupService'

const DIMENSIONS = [
  ['MASS', 'Mass'],
  ['VOLUME', 'Volume'],
  ['COUNT', 'Count'],
]
const EMPTY_FORM = { code: '', name: '', dimension: 'MASS', canonical_factor: '' }
const PAGE_SIZE = 20

export default function OrgUnitsTab() {
  const [data, setData] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const requestRef = useRef(0)

  const load = async () => {
    const id = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const result = await listUnitsAdmin({ search, page, pageSize: PAGE_SIZE })
      if (requestRef.current !== id) return
      setData(result)
    } catch (err) {
      if (requestRef.current !== id) return
      setError(getErrorMessage(err))
    } finally {
      if (requestRef.current === id) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page])

  useEffect(() => setPage(1), [search])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setModal({ mode: 'create' })
  }

  const openEdit = (unit) => {
    setForm({ code: unit.code, name: unit.name, dimension: unit.dimension, canonical_factor: unit.canonical_factor ?? '' })
    setFieldErrors({})
    setModal({ mode: 'edit', unit })
  }

  const closeModal = () => {
    if (saving) return
    setModal(null)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setFieldErrors({})
    try {
      if (modal.mode === 'create') {
        const payload = { code: form.code.trim(), name: form.name.trim(), dimension: form.dimension }
        if (form.dimension !== 'COUNT' && form.canonical_factor !== '') payload.canonical_factor = form.canonical_factor
        await createUnit(payload)
        setNotice(`Unit ${form.code.trim()} created.`)
      } else {
        await updateUnit(modal.unit.id, { name: form.name.trim() })
        setNotice(`Unit ${modal.unit.code} saved.`)
      }
      setModal(null)
      load()
    } catch (err) {
      const data_ = err?.response?.data
      if (data_ && typeof data_ === 'object') setFieldErrors(data_)
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (unit) => {
    const verb = unit.is_active ? 'Deactivate' : 'Activate'
    if (!(await confirmAction(`${verb} ${unit.code}?`, { confirmLabel: verb, danger: unit.is_active, title: `${verb} unit` }))) return
    setError('')
    try {
      if (unit.is_active) await deactivateUnit(unit.id)
      else await activateUnit(unit.id)
      setNotice(`${unit.code} ${unit.is_active ? 'deactivated' : 'activated'}.`)
      load()
    } catch (err) {
      // A deactivate can be refused (400) while a material still uses this unit as its base unit.
      setError(getErrorMessage(err))
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="org-tab">
      <div className="org-tab-head">
        <div>
          <h3>Units of measure</h3>
          <p className="field-muted">{data.count} unit{data.count === 1 ? '' : 's'}.</p>
        </div>
        <Button onClick={openCreate}>+ Add unit</Button>
      </div>

      {error && <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <input className="field-input org-search" placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Dimension</th><th>Canonical factor</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}><Spinner tone="brand" label="Loading…" /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>No units found.</td></tr>
            ) : (
              data.results.map((u) => (
                <tr key={u.id}>
                  <td className="cell-strong">{u.code}</td>
                  <td>{u.name}</td>
                  <td>{u.dimension}</td>
                  <td>{u.canonical_factor ?? '—'}</td>
                  <td>{u.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button type="button" className="table-edit" onClick={() => openEdit(u)}>Edit</button>
                    <button type="button" className="table-edit" style={{ marginLeft: 12 }} onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="inv-toolbar">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</Button>
          <span>Page {page} of {totalPages}</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Add unit' : `Edit ${modal.unit.code}`}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={save} loading={saving} disabled={saving}>{modal.mode === 'create' ? 'Create' : 'Save'}</Button>
            </>
          }
        >
          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="org-unit-code">Code *</label>
              <input id="org-unit-code" className="field-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={modal.mode === 'edit'} required />
              {fieldErrors.code && <span className="field-error">{fieldErrors.code}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-unit-name">Name *</label>
              <input id="org-unit-name" className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-unit-dim">Dimension *</label>
              {modal.mode === 'create' ? (
                <select id="org-unit-dim" className="field-input" value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value, canonical_factor: '' })}>
                  {DIMENSIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              ) : (
                <div className="field-input field-readonly">{form.dimension}</div>
              )}
              {modal.mode === 'edit' && <span className="field-muted">Dimension cannot be changed after creation.</span>}
            </div>
            {form.dimension !== 'COUNT' && (
              <div className="field">
                <label className="field-label" htmlFor="org-unit-factor">Canonical factor</label>
                {modal.mode === 'create' ? (
                  <input id="org-unit-factor" className="field-input" type="number" step="any" min="0" value={form.canonical_factor} onChange={(e) => setForm({ ...form, canonical_factor: e.target.value })} placeholder="Optional" />
                ) : (
                  <div className="field-input field-readonly">{form.canonical_factor || 'Not set'}</div>
                )}
                {fieldErrors.canonical_factor && <span className="field-error">{fieldErrors.canonical_factor}</span>}
                {modal.mode === 'edit' && <span className="field-muted">Cannot be changed once set. No general conversion engine exists - this is informational only.</span>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
