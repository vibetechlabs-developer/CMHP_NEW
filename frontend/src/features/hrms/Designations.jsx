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
  code: '',
  department: '',
  level: '',
  company: '',
  description: '',
}

const sameText = (a, b) =>
  String(a || '').trim().toLowerCase() ===
  String(b || '').trim().toLowerCase()


export default function Designations() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  // Only users who can see every company may create/edit shared
  // ("Both companies") designations.
  const canShare = scopedCompanies.length === 0

  const [designations, setDesignations] = useState([])
  const [companies, setCompanies] = useState([])
  const [departments, setDepartments] = useState([])
  const [employees, setEmployees] = useState([])

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)


  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [
        designationsResponse,
        companiesResponse,
        departmentsResponse,
        employeesResponse,
      ] = await Promise.all([
        hrService.getDesignations(scopedCompanies),
        companyService.getCompanies(),
        companyService.getDepartments(),
        hrService.getEmployees(scopedCompanies),
      ])

      setDesignations(designationsResponse.data)
      setCompanies(companiesResponse.data.filter((c) => c.is_active))
      setDepartments(departmentsResponse.data.filter((d) => d.is_active))
      setEmployees(employeesResponse.data)
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


  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies


  const companyName = (id) => {
    if (!id) {
      return 'Both companies'
    }

    return (
      companies.find((c) => Number(c.id) === Number(id))?.name ||
      '\u2014'
    )
  }


  const departmentName = (id) => {
    if (!id) {
      return ''
    }

    return (
      departments.find((d) => Number(d.id) === Number(id))?.name || ''
    )
  }


  // Employees hold the designation as text, so match by name (and by
  // company when the designation belongs to a single company).
  const employeesOf = (designation) =>
    employees.filter(
      (employee) =>
        sameText(employee.designation, designation.name) &&
        (!designation.company ||
          Number(employee.primary_company) ===
            Number(designation.company))
    )

  const employeeCount = (designation) =>
    employeesOf(designation).length

  const isEditable = (designation) =>
    canShare || Boolean(designation.company)


  const query = search.trim().toLowerCase()

  const rows = designations
    .filter((designation) => {
      if (companyFilter === 'SHARED') {
        return !designation.company
      }

      if (companyFilter !== 'ALL') {
        return (
          !designation.company ||
          Number(designation.company) === Number(companyFilter)
        )
      }

      return true
    })
    .filter((designation) => {
      if (statusFilter === 'ACTIVE') {
        return designation.is_active
      }

      if (statusFilter === 'INACTIVE') {
        return !designation.is_active
      }

      return true
    })
    .filter((designation) => {
      if (!query) {
        return true
      }

      return [
        designation.name,
        designation.code,
        designation.description,
        departmentName(designation.department),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
    .sort(
      (a, b) =>
        (a.level ?? 9999) - (b.level ?? 9999) ||
        a.name.localeCompare(b.name)
    )

  const activeCount = designations.filter((d) => d.is_active).length

  const editingInUse = editing ? employeeCount(editing) > 0 : false


  const openCreate = () => {
    setEditing(null)

    setForm({
      ...EMPTY_FORM,
      company: canShare
        ? ''
        : String(companyOptions[0]?.id || ''),
    })

    setError('')
    setModalOpen(true)
  }


  const openEdit = (designation) => {
    setEditing(designation)

    setForm({
      name: designation.name || '',
      code: designation.code || '',
      department: designation.department
        ? String(designation.department)
        : '',
      level:
        designation.level === null || designation.level === undefined
          ? ''
          : String(designation.level),
      company: designation.company ? String(designation.company) : '',
      description: designation.description || '',
    })

    setError('')
    setModalOpen(true)
  }


  const closeModal = () => {
    if (saving) {
      return
    }

    setModalOpen(false)
    setEditing(null)
    setError('')
  }


  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((current) => ({ ...current, [name]: value }))
  }


  const save = async (event) => {
    event.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setError('Designation name is required.')
      return
    }

    if (form.level && (!Number.isInteger(Number(form.level)) || Number(form.level) < 1)) {
      setError('Level must be a whole number of 1 or more.')
      return
    }

    if (!canShare && !form.company) {
      setError('Please select a company.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name,
        code: form.code.trim().toUpperCase(),
        department: form.department ? Number(form.department) : null,
        level: form.level ? Number(form.level) : null,
        company: form.company ? Number(form.company) : null,
        description: form.description.trim(),
      }

      const others = designations.filter(
        (d) => !editing || Number(d.id) !== Number(editing.id)
      )

      const nameClash = others.find(
        (d) =>
          sameText(d.name, payload.name) &&
          (!d.company ||
            !payload.company ||
            Number(d.company) === Number(payload.company))
      )

      if (nameClash) {
        throw new Error(
          nameClash.company
            ? `"${payload.name}" already exists for ${companyName(nameClash.company)}.`
            : `"${payload.name}" already exists as a shared designation.`
        )
      }

      if (payload.code) {
        const codeClash = others.find((d) => sameText(d.code, payload.code))

        if (codeClash) {
          throw new Error(
            `Code "${payload.code}" is already used by "${codeClash.name}".`
          )
        }
      }

      if (editing) {
        const oldName = editing.name.trim()

        await hrService.updateDesignation(editing.id, payload)

        // Keep employee records in sync when the designation is renamed.
        if (oldName !== payload.name) {
          await Promise.all(
            employeesOf(editing).map((employee) =>
              hrService.updateEmployee(employee.id, {
                designation: payload.name,
              })
            )
          )
        }
      } else {
        await hrService.createDesignation(payload)
      }

      setModalOpen(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const changeStatus = async (designation) => {
    const action = designation.is_active ? 'deactivate' : 'reactivate'

    if (
      !(await confirmAction(
        `Are you sure you want to ${action} "${designation.name}"?`
      ))
    ) {
      return
    }

    setError('')

    try {
      if (designation.is_active) {
        await hrService.deactivateDesignation(designation.id)
      } else {
        await hrService.reactivateDesignation(designation.id)
      }

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const remove = async (designation) => {
    const inUse = employeeCount(designation)

    if (inUse > 0) {
      setError(
        `"${designation.name}" is assigned to ${inUse} employee${inUse === 1 ? '' : 's'}. Deactivate it instead of deleting.`
      )
      return
    }

    if (
      !(await confirmAction(
        `Delete "${designation.name}"? This cannot be undone.`
      ))
    ) {
      return
    }

    setError('')

    try {
      await hrService.deleteDesignation(designation.id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>Designations</h1>
          <p>Your current role does not have access to designation masters.</p>
        </section>
      </div>
    )
  }


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span
            className="dash-pill"
            style={{ marginBottom: 6, display: 'inline-block' }}
          >
            HRMS
          </span>
          <h1>Designations</h1>
          <p>
            Maintain the designation master (US-HR-9). A designation can
            belong to one company or be shared by both. Employees pick from
            this list on the Employees screen.
          </p>
        </div>
      </div>

      <section className="company-panel">

        <div className="company-toolbar">
          <div>
            <h2>Designation masters</h2>
            <p>
              {designations.length} designation
              {designations.length === 1 ? '' : 's'} &middot; {activeCount} active
            </p>
          </div>

          <Button onClick={openCreate}>+ Add designation</Button>
        </div>

        <div className="hr-filters">
          <input
            className="company-search"
            placeholder="Search by name, code, department or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="company-select"
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="ALL">All companies</option>
            {canShare && <option value="SHARED">Shared only</option>}
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Designation</th>
                <th>Code</th>
                <th>Department</th>
                <th>Level</th>
                <th>Company</th>
                <th>Employees</th>
                <th>Status</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="company-empty">
                    <Spinner tone="brand" label="Loading designations..." />
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((designation) => (
                  <tr key={designation.id}>
                    <td>
                      <strong>{designation.name}</strong>
                      {designation.description && (
                        <div className="hr-subtext">
                          {designation.description}
                        </div>
                      )}
                    </td>

                    <td>
                      {designation.code ? (
                        <span className="company-code">{designation.code}</span>
                      ) : (
                        '\u2014'
                      )}
                    </td>

                    <td>{departmentName(designation.department) || '\u2014'}</td>

                    <td>{designation.level ?? '\u2014'}</td>

                    <td>{companyName(designation.company)}</td>

                    <td>{employeeCount(designation)}</td>

                    <td>
                      <span
                        className={
                          designation.is_active
                            ? 'company-status active'
                            : 'company-status inactive'
                        }
                      >
                        {designation.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="company-actions">
                      {isEditable(designation) ? (
                        <>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => openEdit(designation)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              designation.is_active
                                ? 'company-link danger'
                                : 'company-link'
                            }
                            onClick={() => changeStatus(designation)}
                          >
                            {designation.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>

                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() => remove(designation)}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <span className="hr-subtext">Shared &ndash; view only</span>
                      )}
                    </td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan="8" className="company-empty">
                    {designations.length === 0
                      ? 'No designations configured yet.'
                      : 'No designations match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit designation' : 'Add designation'}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add designation'}
              </Button>
            </>
          }
        >
          <Alert type="error">{error}</Alert>

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Designation name"
                name="name"
                placeholder="e.g. Production Supervisor"
                value={form.name}
                onChange={handleChange}
                required
              />

              <Input
                label="Code (optional)"
                name="code"
                placeholder="e.g. PROD-SUP"
                value={form.code}
                onChange={handleChange}
              />

              <div className="field">
                <label className="field-label">Department (optional)</label>
                <select
                  className="field-input"
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                >
                  <option value="">Any department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Hierarchy level (1 = top)"
                name="level"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 3"
                value={form.level}
                onChange={handleChange}
              />

              <div className="field">
                <label className="field-label">Company</label>
                <select
                  className="field-input"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  disabled={editingInUse}
                >
                  {canShare && <option value="">Both companies (shared)</option>}
                  {companyOptions.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>

                {editingInUse && (
                  <small className="hr-hint">
                    Company can&rsquo;t be changed while employees use this designation.
                  </small>
                )}
              </div>

              <div className="field company-form-full">
                <label className="field-label">Description (optional)</label>
                <textarea
                  className="field-input company-textarea"
                  name="description"
                  rows="3"
                  value={form.description}
                  onChange={handleChange}
                />
              </div>
            </div>

            {editing && editingInUse && (
              <small className="hr-hint">
                Renaming this designation also updates the {employeeCount(editing)}{' '}
                employee{employeeCount(editing) === 1 ? '' : 's'} who currently hold it.
              </small>
            )}
          </form>
        </Modal>
      )}
    </div>
  )
}