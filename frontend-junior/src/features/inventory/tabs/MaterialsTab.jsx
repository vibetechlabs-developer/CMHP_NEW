import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import { can } from '../permissions'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Modal from '../components/Modal'
import { previewDocumentNumber, commitDocumentNumber } from '../../../utils/documentNumbers'

const DEMO_UNIT_CODES = new Set(['DEMOBTL', 'DEMOKG', 'DEMOMG', 'DEMOMKG'])

const CATEGORIES = [
  ['RAW_MATERIAL', 'Raw Material'],
  ['PACKAGING_MATERIAL', 'Packaging Material'],
  ['MOTHER_TINCTURE', 'Mother Tincture'],
  ['FINISHED_GOOD', 'Finished Good'],
]

const emptyForm = {
  code: '',
  name: '',
  category: 'RAW_MATERIAL',
  uom: '',
  reorder_level: '0',
  description: '',
}

const listData = (response) =>
  Array.isArray(response.data) ? response.data : response.data?.results || []

const categoryName = (value) =>
  CATEGORIES.find(([key]) => key === value)?.[1] || value || '—'

export default function MaterialsTab({ role }) {
  const [items, setItems] = useState([])
  const [uoms, setUoms] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const [itemsResponse, uomsResponse] = await Promise.all([
        inventoryService.getItems(),
        inventoryService.getUoms(),
      ])

      setItems(listData(itemsResponse))
      setUoms(
        listData(uomsResponse).filter(
          (uom) =>
            uom.is_active !== false &&
            !DEMO_UNIT_CODES.has(uom.code) &&
            !uom.code?.startsWith('DEMO')
        )
      )
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    const nextCode = previewDocumentNumber('ITEM')
    setForm({
      ...emptyForm,
      code: nextCode,
    })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      code: item.code,
      name: item.name,
      category: item.category,
      uom: String(item.uom),
      reorder_level: String(item.reorder_level ?? 0),
      description: item.description || '',
    })
    setError('')
    setModalOpen(true)
  }

  const close = () => {
    if (!saving) {
      setModalOpen(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()

    let finalCode = form.code.trim()
    if (!editing) {
      finalCode = commitDocumentNumber('ITEM')
    }

    const payload = {
      ...form,
      code: finalCode,
      name: form.name.trim(),
      description: form.description.trim(),
      uom: Number(form.uom),
      reorder_level: Number(form.reorder_level),
    }

    if (
      !payload.code ||
      !payload.name ||
      !payload.uom ||
      Number.isNaN(payload.reorder_level) ||
      payload.reorder_level < 0
    ) {
      setError(
        'Enter a code, name, active unit of measure, and a reorder level of zero or greater.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editing) {
        await inventoryService.updateItem(editing.id, payload)
      } else {
        await inventoryService.createItem(payload)
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (item) => {
    const action = item.is_active ? 'deactivate' : 'reactivate'
    const label = action === 'deactivate' ? 'Deactivate' : 'Reactivate'

    if (!window.confirm(`${label} ${item.name}?`)) {
      return
    }

    try {
      await inventoryService[`${action}Item`](item.id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const filtered = items.filter((item) =>
    `${item.code} ${item.name} ${item.category}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Material master</h3>
          <p style={{ marginTop: 4, fontSize: 12, color: '#7d92aa' }}>
            Manage materials, categories, units of measure and reorder levels.
          </p>
        </div>

        {can(role, 'create') && (
          <Button onClick={openCreate}>+ Add material</Button>
        )}
      </div>

      {!modalOpen && error && <Alert type="error">{error}</Alert>}

      <input
        className="field-input"
        style={{ display: 'block', maxWidth: 380, marginBottom: 16 }}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search code, name or category"
      />

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>UOM</th>
              <th>Reorder level</th>
              <th>Available</th>
              <th>Status</th>
              {can(role, 'edit') && <th>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="cell-strong">{item.code}</td>
                <td>{item.name}</td>
                <td>{categoryName(item.category)}</td>
                <td>{item.uom_code}</td>
                <td>{item.reorder_level}</td>
                <td>{item.available_quantity} {item.uom_code}</td>
                <td>{item.is_active ? 'Active' : 'Inactive'}</td>

                {can(role, 'edit') && (
                  <td>
                    <Button
                      variant="secondary"
                      onClick={() => openEdit(item)}
                      style={{ marginRight: 6 }}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => changeStatus(item)}
                    >
                      {item.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!filtered.length && (
          <p className="inv-empty">No materials found.</p>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit material' : 'Add material'}
          onClose={close}
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={close}>
                Cancel
              </Button>
              <Button loading={saving} onClick={submit}>
                Save material
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={submit}>
            <div className="inv-form-grid">
              <Input
                label="Item code (Auto-generated)"
                value={form.code}
                disabled
                readOnly
              />

              <Input
                label="Item name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Unit of measure</label>
                <select
                  className="field-input"
                  value={form.uom}
                  onChange={(event) => setForm({ ...form, uom: event.target.value })}
                  required
                >
                  <option value="">Select UOM</option>
                  {uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} — {uom.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Reorder level"
                type="number"
                min="0"
                step="0.001"
                value={form.reorder_level}
                onChange={(event) =>
                  setForm({ ...form, reorder_level: event.target.value })
                }
                required
              />

              <div className="field field-full">
                <label className="field-label">Description</label>
                <textarea
                  className="field-input"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}