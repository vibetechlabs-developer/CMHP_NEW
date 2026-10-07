import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import Modal from '../inventory/components/Modal'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageMasters } from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const EMPTY_FORM = {
  name: '',
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  grace_minutes: 10,
  weekly_off: 'Sunday',
  company: '',
}


export default function Shifts() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [shifts, setShifts] = useState([])
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)


  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [shiftsResponse, companiesResponse] = await Promise.all([
        hrService.getShifts(scopedCompanies),
        companyService.getCompanies(),
      ])

      setShifts(shiftsResponse.data)
      setCompanies(companiesResponse.data.filter((c) => c.is_active))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const companyName = (id) => {
    if (!id) {
      return 'Both companies'
    }

    return companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'
  }


  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }


  const openEdit = (shift) => {
    setEditing(shift)

    setForm({
      name: shift.name || '',
      start_time: shift.start_time || '09:00',
      end_time: shift.end_time || '18:00',
      break_minutes: shift.break_minutes ?? 60,
      grace_minutes: shift.grace_minutes ?? 10,
      weekly_off: shift.weekly_off || 'Sunday',
      company: shift.company ? String(shift.company) : '',
    })

    setError('')
    setModalOpen(true)
  }


  const save = async (event) => {
    event.preventDefault()

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes) || 0,
        grace_minutes: Number(form.grace_minutes) || 0,
        weekly_off: form.weekly_off.trim(),
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateShift(editing.id, payload)
      } else {
        await hrService.createShift(payload)
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const changeStatus = async (shift) => {
    const action = shift.is_active ? 'deactivate' : 'reactivate'

    if (!(await confirmAction(`Are you sure you want to ${action} "${shift.name}"?`))) {
      return
    }

    setError('')

    try {
      if (shift.is_active) {
        await hrService.deactivateShift(shift.id)
      } else {
        await hrService.reactivateShift(shift.id)
      }

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel">
          <h1>Shifts</h1>
          <p>Your current role does not have access to shift masters.</p>
        </section>
      </div>
    )
  }


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Shifts</h1>
          <p>
            Shift rules can differ per company (US-HR-8). Assign a shift
            to an employee from the Employees screen.
          </p>
        </div>
      </div>

      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Shift masters</h2>
            <p>{shifts.length} shift{shifts.length === 1 ? '' : 's'} configured</p>
          </div>

          <Button onClick={openCreate}>+ Add shift</Button>
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Timing</th>
                <th>Break</th>
                <th>Grace</th>
                <th>Weekly off</th>
                <th>Company</th>
                <th>Status</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="company-empty">Loading shifts...</td>
                </tr>
              )}

              {!loading &&
                shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td><strong>{shift.name}</strong></td>
                    <td>{shift.start_time} &ndash; {shift.end_time}</td>
                    <td>{shift.break_minutes} min</td>
                    <td>{shift.grace_minutes} min</td>
                    <td>{shift.weekly_off}</td>
                    <td>{companyName(shift.company)}</td>
                    <td>
                      <span className={shift.is_active ? 'company-status active' : 'company-status inactive'}>
                        {shift.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="company-actions">
                      <button type="button" className="company-link" onClick={() => openEdit(shift)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={shift.is_active ? 'company-link danger' : 'company-link'}
                        onClick={() => changeStatus(shift)}
                      >
                        {shift.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && shifts.length === 0 && (
                <tr>
                  <td colSpan="8" className="company-empty">No shifts configured yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit shift' : 'Add shift'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add shift'}
              </Button>
            </>
          }
        >
          <Alert type="error">{error}</Alert>

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Shift name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Start time</label>
                <input
                  className="field-input"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">End time</label>
                <input
                  className="field-input"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </div>

              <Input
                label="Break (minutes)"
                type="number"
                min="0"
                value={form.break_minutes}
                onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
              />

              <Input
                label="Grace period (minutes)"
                type="number"
                min="0"
                value={form.grace_minutes}
                onChange={(e) => setForm({ ...form, grace_minutes: e.target.value })}
              />

              <Input
                label="Weekly off"
                placeholder="e.g. Sunday"
                value={form.weekly_off}
                onChange={(e) => setForm({ ...form, weekly_off: e.target.value })}
              />

              <div className="field">
                <label className="field-label">Company</label>
                <select
                  className="field-input"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                >
                  <option value="">Both companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}