import { confirmAction } from '../../../components/ConfirmProvider'
import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import { can } from '../permissions'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Modal from '../components/Modal'

const emptyForm = {
  code: '',
  name: '',
  is_quarantine: false,
}

function listData(response) {
  return Array.isArray(response.data) ? response.data : response.data?.results || []
}

export default function LocationsTab({ role }) {
  const [locations, setLocations] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const response = await inventoryService.getLocations()
      setLocations(listData(response))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (location) => {
    setEditing(location)
    setForm({
      code: location.code,
      name: location.name,
      is_quarantine: location.is_quarantine,
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

    const payload = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
    }

    if (!payload.code || !payload.name) {
      setError('Location code and name are required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editing) {
        await inventoryService.updateLocation(editing.id, payload)
      } else {
        await inventoryService.createLocation(payload)
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (location) => {
    const action = location.is_active ? 'deactivate' : 'reactivate'
    const label = action === 'deactivate' ? 'Deactivate' : 'Reactivate'

    if (!(await confirmAction(`${label} ${location.name}?`))) {
      return
    }

    try {
      await inventoryService[`${action}Location`](location.id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const filtered = locations.filter((location) =>
    `${location.code} ${location.name}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Storage locations</h3>
          <p style={{ marginTop: 4, fontSize: 12, color: '#7d92aa' }}>
            Create locations here before recording stock receipts.
          </p>
        </div>

        {can(role, 'create') && (
          <Button onClick={openCreate}>
            + Add location
          </Button>
        )}
      </div>

      {!modalOpen && error && <Alert type="error">{error}</Alert>}

      <input
        className="field-input"
        style={{ display: 'block', maxWidth: 380, marginBottom: 16 }}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search locations"
      />

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              {can(role, 'edit') && <th>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {filtered.map((location) => (
              <tr key={location.id}>
                <td className="cell-strong">{location.code}</td>
                <td>{location.name}</td>
                <td>{location.is_quarantine ? 'Quarantine' : 'Standard'}</td>
                <td>{location.is_active ? 'Active' : 'Inactive'}</td>

                {can(role, 'edit') && (
                  <td>
                    <Button
                      variant="secondary"
                      onClick={() => openEdit(location)}
                      style={{ marginRight: 6 }}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => changeStatus(location)}
                    >
                      {location.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!filtered.length && (
          <p className="inv-empty">No locations found.</p>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit location' : 'Add location'}
          onClose={close}
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={close}>
                Cancel
              </Button>
              <Button loading={saving} onClick={submit}>
                Save location
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={submit}>
            <div className="inv-form-grid">
              <Input
                label="Location code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                required
              />

              <Input
                label="Location name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />

              <label
                className="field-full"
                style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}
              >
                <input
                  type="checkbox"
                  checked={form.is_quarantine}
                  onChange={(event) =>
                    setForm({ ...form, is_quarantine: event.target.checked })
                  }
                />
                This is a quarantine / rejected-stock location
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}