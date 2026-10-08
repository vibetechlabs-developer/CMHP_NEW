import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Spinner from '../../components/Spinner'
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
  date: '',
  company: '',
}


export default function Holidays() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [holidays, setHolidays] = useState([])
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
      const [holidaysResponse, companiesResponse] = await Promise.all([
        hrService.getHolidays(scopedCompanies),
        companyService.getCompanies(),
      ])

      setHolidays(holidaysResponse.data)
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


  const openEdit = (holiday) => {
    setEditing(holiday)

    setForm({
      name: holiday.name || '',
      date: holiday.date || '',
      company: holiday.company ? String(holiday.company) : '',
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
        date: form.date,
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateHoliday(editing.id, payload)
      } else {
        await hrService.createHoliday(payload)
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const remove = async (holiday) => {
    if (!(await confirmAction(`Remove "${holiday.name}" from the holiday calendar?`))) {
      return
    }

    setError('')

    try {
      await hrService.deleteHoliday(holiday.id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Holidays</h1>
          <p>
            Company holiday calendar. Attendance for a holiday date is
            calculated against the applicable company&rsquo;s calendar (US-HR-7).
          </p>
        </div>
      </div>

      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Holiday calendar</h2>
            <p>{holidays.length} holiday{holidays.length === 1 ? '' : 's'} configured</p>
          </div>

          {canManage && <Button onClick={openCreate}>+ Add holiday</Button>}
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Holiday</th>
                <th>Company</th>
                {canManage && <th className="company-actions">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="company-empty">
                    <Spinner tone="brand" label="Loading holidays..." />
                  </td>
                </tr>
              )}

              {!loading &&
                holidays.map((holiday) => (
                  <tr key={holiday.id}>
                    <td>{holiday.date}</td>
                    <td><strong>{holiday.name}</strong></td>
                    <td>{companyName(holiday.company)}</td>

                    {canManage && (
                      <td className="company-actions">
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => openEdit(holiday)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="company-link danger"
                          onClick={() => remove(holiday)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

              {!loading && holidays.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="company-empty">
                    No holidays configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit holiday' : 'Add holiday'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>

              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add holiday'}
              </Button>
            </>
          }
        >
          <Alert type="error">{error}</Alert>

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Holiday name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Date</label>
                <input
                  className="field-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Applies to</label>
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