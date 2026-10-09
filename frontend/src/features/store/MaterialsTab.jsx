import './store.css'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
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
  listMaterials,
  updateMaterial,
} from './storeService'

const PAGE_SIZE = 20
const KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging' }
const WRITE_DENIED = 'Only an administrator can change the material catalog. You can still search and view materials.'

// Shared material master. The catalog is shared by both companies and the store:
// one material, one code. No stock, ownership, price or QC status lives here.
// `canManage` comes from the server's capability (`can_manage_material_catalog`).
// Without it, every write control is hidden and the list is read-only.
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
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
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
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    listMaterials({ search, kind, isActive: status, page, pageSize: PAGE_SIZE })
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
  }, [search, kind, status, page, reloadKey])

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

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Materials</h3>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7f95', display: 'flex', alignItems: 'center', gap: 8 }}>
            Shared catalog for all stores and companies.{' '}
            {loading ? <Spinner size="xs" tone="muted" label="Loading…" /> : `${data.count} material${data.count === 1 ? '' : 's'} found.`}
          </p>
          {!canManage && <p className="field-muted" style={{ margin: '4px 0 0' }}>Read-only access. Only an administrator can change the material catalog.</p>}
        </div>
        {canManage && (
          <div className="inv-toolbar-actions">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Import materials
            </Button>
            <Button onClick={() => setEditing({ mode: 'create' })}>+ Add material</Button>
          </div>
        )}
      </div>

      <div className="store-filter-bar" role="search">
        <input
          className="field-input store-search"
          type="search"
          placeholder="Search by code or name"
          aria-label="Search materials"
          value={search}
          onChange={(event) => setFilter({ search: event.target.value, page: null })}
        />
        <select className="field-input store-filter" aria-label="Material type" value={kind} onChange={(e) => setFilter({ kind: e.target.value, page: null })}>
          <option value="">All types</option>
          <option value="RAW_MATERIAL">Raw material</option>
          <option value="PACKAGING_MATERIAL">Packaging</option>
        </select>
        <select className="field-input store-filter" aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value, page: null })}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {error && (
        <Alert type="error">
          {error}{' '}
          <button type="button" className="table-edit" onClick={() => reload()}>
            Retry
          </button>
        </Alert>
      )}

      <div className="inv-table-scroll">
        <table className="inv-table" style={{ fontSize: 14 }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Base unit</th>
              <th>Status</th>
              <th>Register</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.results.map((material) => (
              <tr key={material.id}>
                <td className="cell-strong">
                  <Link to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }}>
                    {material.code}
                  </Link>
                </td>
                <td>
                  <Link to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }}>
                    {material.name}
                  </Link>
                </td>
                <td>{KIND_LABEL[material.kind] || material.kind}</td>
                <td>{material.base_unit_code}</td>
                <td>{material.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  <Link className="table-edit" to={`/inventory/materials/${material.id}`} state={{ returnSearch: searchParams.toString() }}>
                    View register
                  </Link>
                </td>
                {canManage && (
                  <td>
                    <button type="button" className="table-edit" onClick={() => setEditing({ mode: 'edit', material })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-edit"
                      style={{ marginLeft: 12 }}
                      onClick={() => toggle(material)}
                      disabled={busyId === material.id}
                    >
                      {material.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {loading && data.results.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Spinner tone="brand" label="Loading materials…" />
                </td>
              </tr>
            )}
            {!loading && !error && data.results.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', color: '#6b7f95' }}>
                  No materials match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.count > PAGE_SIZE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
          <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setFilter({ page: page - 1 })}>
            Previous
          </Button>
          <span className="field-muted">
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages || loading} onClick={() => setFilter({ page: page + 1 })}>
            Next
          </Button>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

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
        await updateMaterial(material.id, { name: name.trim(), description: description.trim() })
        onSaved(`${material.code} saved.`)
      } else {
        await createMaterial({
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unit.id),
        })
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
        <label className="field-label" htmlFor="mat-desc">Description (optional)</label>
        <input id="mat-desc" className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  )
}
