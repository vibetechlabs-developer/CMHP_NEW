import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner from '../../../components/Spinner'
import Modal from '../../inventory/components/Modal'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import {
  activateStore,
  createStore,
  deactivateStore,
  listStoresAdmin,
  updateStore,
} from '../organizationSetupService'

const EMPTY_FORM = { code: '', name: '', description: '' }
const PAGE_SIZE = 20

// Mirrors OrgCompaniesTab.jsx exactly, for SharedStore - stores have no
// owning-company concept at all, so there is deliberately no company
// picker or scoping anywhere on this screen.
export default function OrgStoresTab() {
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
      const result = await listStoresAdmin({ search, page, pageSize: PAGE_SIZE })
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

  const openEdit = (store) => {
    setForm({ code: store.code, name: store.name, description: store.description || '' })
    setFieldErrors({})
    setModal({ mode: 'edit', store })
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
        await createStore({ code: form.code.trim(), name: form.name.trim(), description: form.description.trim() })
        setNotice(`Store ${form.code.trim()} created.`)
      } else {
        await updateStore(modal.store.id, { name: form.name.trim(), description: form.description.trim() })
        setNotice(`Store ${modal.store.code} saved.`)
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

  const toggleActive = async (store) => {
    const verb = store.is_active ? 'Deactivate' : 'Activate'
    if (
      !(await confirmAction(`${verb} ${store.code}? This never removes any role or membership already recorded for it.`, {
        confirmLabel: verb,
        danger: store.is_active,
        title: `${verb} store`,
      }))
    )
      return
    setError('')
    try {
      if (store.is_active) await deactivateStore(store.id)
      else await activateStore(store.id)
      setNotice(`${store.code} ${store.is_active ? 'deactivated' : 'activated'}.`)
      load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="org-tab">
      <div className="org-tab-head">
        <div>
          <h3>Shared stores</h3>
          <p className="field-muted">{data.count} store{data.count === 1 ? '' : 's'}. Shared stores are not owned by any one company.</p>
        </div>
        <Button onClick={openCreate}>+ Add store</Button>
      </div>

      {error && <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <input className="field-input org-search" placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}><Spinner tone="brand" label="Loading…" /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No stores found.</td></tr>
            ) : (
              data.results.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.description || '—'}</td>
                  <td>{s.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button type="button" className="table-edit" onClick={() => openEdit(s)}>Edit</button>
                    <button type="button" className="table-edit" style={{ marginLeft: 12 }} onClick={() => toggleActive(s)}>
                      {s.is_active ? 'Deactivate' : 'Activate'}
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
          title={modal.mode === 'create' ? 'Add store' : `Edit ${modal.store.code}`}
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
              <label className="field-label" htmlFor="org-st-code">Code *</label>
              <input id="org-st-code" className="field-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={modal.mode === 'edit'} required />
              {fieldErrors.code && <span className="field-error">{fieldErrors.code}</span>}
              {modal.mode === 'edit' && <span className="field-muted">Code cannot be changed after creation.</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-st-name">Name *</label>
              <input id="org-st-name" className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-st-desc">Description</label>
              <input id="org-st-desc" className="field-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {fieldErrors.description && <span className="field-error">{fieldErrors.description}</span>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
