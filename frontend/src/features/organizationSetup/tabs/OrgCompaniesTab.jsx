import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner from '../../../components/Spinner'
import Modal from '../../inventory/components/Modal'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import {
  activateCompany,
  createCompany,
  deactivateCompany,
  listCompaniesAdmin,
  updateCompany,
} from '../organizationSetupService'

const EMPTY_FORM = { code: '', legal_name: '', display_name: '' }
const PAGE_SIZE = 20

export default function OrgCompaniesTab() {
  const [data, setData] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null) // null | {mode:'create'} | {mode:'edit', company}
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const requestRef = useRef(0)

  const load = async () => {
    const id = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const result = await listCompaniesAdmin({ search, page, pageSize: PAGE_SIZE })
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

  const openEdit = (company) => {
    setForm({ code: company.code, legal_name: company.legal_name, display_name: company.display_name || '' })
    setFieldErrors({})
    setModal({ mode: 'edit', company })
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
        await createCompany({ code: form.code.trim(), legal_name: form.legal_name.trim(), display_name: form.display_name.trim() })
        setNotice(`Company ${form.code.trim()} created.`)
      } else {
        await updateCompany(modal.company.id, { legal_name: form.legal_name.trim(), display_name: form.display_name.trim() })
        setNotice(`Company ${modal.company.code} saved.`)
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

  const toggleActive = async (company) => {
    const verb = company.is_active ? 'Deactivate' : 'Activate'
    if (
      !(await confirmAction(`${verb} ${company.code}? This never removes any role, membership or data already recorded for it.`, {
        confirmLabel: verb,
        danger: company.is_active,
        title: `${verb} company`,
      }))
    )
      return
    setError('')
    try {
      if (company.is_active) await deactivateCompany(company.id)
      else await activateCompany(company.id)
      setNotice(`${company.code} ${company.is_active ? 'deactivated' : 'activated'}.`)
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
          <h3>Companies</h3>
          <p className="field-muted">{data.count} compan{data.count === 1 ? 'y' : 'ies'}.</p>
        </div>
        <Button onClick={openCreate}>+ Add company</Button>
      </div>

      {error && <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <input className="field-input org-search" placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr><th>Code</th><th>Legal name</th><th>Display name</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}><Spinner tone="brand" label="Loading…" /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No companies found.</td></tr>
            ) : (
              data.results.map((c) => (
                <tr key={c.id}>
                  <td className="cell-strong">{c.code}</td>
                  <td>{c.legal_name}</td>
                  <td>{c.display_name || '—'}</td>
                  <td>{c.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button type="button" className="table-edit" onClick={() => openEdit(c)}>Edit</button>
                    <button type="button" className="table-edit" style={{ marginLeft: 12 }} onClick={() => toggleActive(c)}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
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
          title={modal.mode === 'create' ? 'Add company' : `Edit ${modal.company.code}`}
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
              <label className="field-label" htmlFor="org-co-code">Code *</label>
              <input
                id="org-co-code"
                className="field-input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={modal.mode === 'edit'}
                required
              />
              {fieldErrors.code && <span className="field-error">{fieldErrors.code}</span>}
              {modal.mode === 'edit' && <span className="field-muted">Code cannot be changed after creation.</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-co-legal">Legal name *</label>
              <input id="org-co-legal" className="field-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} required />
              {fieldErrors.legal_name && <span className="field-error">{fieldErrors.legal_name}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="org-co-display">Display name</label>
              <input id="org-co-display" className="field-input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              {fieldErrors.display_name && <span className="field-error">{fieldErrors.display_name}</span>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
