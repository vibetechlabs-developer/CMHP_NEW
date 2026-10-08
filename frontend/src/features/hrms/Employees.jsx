import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Spinner from '../../components/Spinner'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageEmployees } from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const ROLES = [
  ['SUPER_ADMIN', 'Super Admin'],
  ['MANAGEMENT', 'Management'],
  ['HR_ADMINISTRATOR', 'HR Administrator'],
  ['HR_MANAGER', 'HR Manager'],
  ['DEPARTMENT_MANAGER', 'Department Manager'],
  ['STORES_MANAGER', 'Stores Manager'],
  ['STORES_USER', 'Stores User'],
  ['EMPLOYEE', 'Employee'],
  ['VIEWER', 'Viewer'],
]

const EMPLOYMENT_STATUS = [
  ['ACTIVE', 'Active'],
  ['ON_LEAVE', 'On Leave'],
  ['NOTICE_PERIOD', 'Notice Period'],
  ['INACTIVE', 'Inactive'],
  ['RESIGNED', 'Resigned'],
  ['TERMINATED', 'Terminated'],
]

const EMPTY_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role: 'EMPLOYEE',
  primary_company: '',
  department: '',
  designation: '',
  employee_id: '',
  joining_date: '',
  employment_status: 'ACTIVE',
  reporting_manager: '',
  shift: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
}


export default function Employees() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageEmployees(user)

  const [employees, setEmployees] = useState([])
  const [companies, setCompanies] = useState([])
  const [departments, setDepartments] = useState([])
  const [shifts, setShifts] = useState([])
  const [designations, setDesignations] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)


  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [
        employeesResponse,
        companiesResponse,
        departmentsResponse,
        shiftsResponse,
        designationsResponse,
      ] = await Promise.all([
        hrService.getEmployees(scopedCompanies),
        companyService.getCompanies(),
        companyService.getDepartments(),
        hrService.getShifts(scopedCompanies),
        hrService.getDesignations(scopedCompanies),
      ])

      setEmployees(employeesResponse.data)

      setCompanies(
        companiesResponse.data.filter((c) => c.is_active)
      )

      setDepartments(
        departmentsResponse.data.filter((d) => d.is_active)
      )

      setShifts(
        shiftsResponse.data.filter((s) => s.is_active)
      )

      setDesignations(
        designationsResponse.data.filter((d) => d.is_active)
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies


  // designations available for the company chosen in the form
  const designationOptions = designations.filter(
    (d) =>
      !d.company ||
      Number(d.company) === Number(form.primary_company)
  )


  const openCreate = () => {
    setSelectedEmployee(null)

    setForm({
      ...EMPTY_FORM,
      primary_company: companyOptions[0]
        ? String(companyOptions[0].id)
        : '',
    })

    setError('')
    setModalOpen(true)
  }


  const openEdit = (employee) => {
    setSelectedEmployee(employee)

    setForm({
      username: employee.username || '',
      password: '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role || 'EMPLOYEE',
      primary_company: employee.primary_company
        ? String(employee.primary_company)
        : '',
      department: employee.department
        ? String(employee.department.id)
        : '',
      designation: employee.designation || '',
      employee_id: employee.employee_id || '',
      joining_date: employee.joining_date || '',
      employment_status: employee.employment_status || 'ACTIVE',
      reporting_manager: employee.reporting_manager
        ? String(employee.reporting_manager)
        : '',
      shift: employee.shift ? String(employee.shift.id) : '',
      bank_name: employee.bank_name || '',
      bank_account_number: employee.bank_account_number || '',
      bank_ifsc: employee.bank_ifsc || '',
    })

    setError('')
    setModalOpen(true)
  }


  const closeModal = () => {
    if (saving) {
      return
    }

    setModalOpen(false)
    setSelectedEmployee(null)
    setError('')
  }


  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.primary_company) {
      setError('Please select the employee\u2019s company.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),

        role: form.role,

        primary_company: Number(form.primary_company),

        department: form.department
          ? Number(form.department)
          : null,

        designation: form.designation.trim(),

        employee_id: form.employee_id.trim() || null,

        joining_date: form.joining_date || null,

        employment_status: form.employment_status,

        reporting_manager: form.reporting_manager
          ? Number(form.reporting_manager)
          : null,

        shift: form.shift ? Number(form.shift) : null,

        bank_name: form.bank_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim(),
      }

      if (!selectedEmployee) {
        await hrService.createEmployee({
          ...payload,
          username: form.username.trim(),
          password: form.password,
          can_access_common_inventory: false,
        })
      } else {
        await hrService.updateEmployee(
          selectedEmployee.id,
          payload
        )
      }

      closeModal()
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const changeStatus = async (employee) => {
    const action = employee.is_active ? 'deactivate' : 'reactivate'

    const confirmed = await confirmAction(
      `Are you sure you want to ${action} ${employee.display_name}?`
    )

    if (!confirmed) {
      return
    }

    setError('')

    try {
      if (employee.is_active) {
        await hrService.deactivateEmployee(employee.id)
      } else {
        await hrService.reactivateEmployee(employee.id)
      }

      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const filtered = employees.filter((employee) => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return true
    }

    const text = [
      employee.display_name,
      employee.employee_id,
      employee.designation,
      employee.email,
      employee.role_label,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(query)
  })


  const managerOptions = employees.filter(
    (employee) =>
      !selectedEmployee || employee.id !== selectedEmployee.id
  )


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>Employees</h1>
          <p>
            Your current role does not have access to the employee
            master. Ask an HR Administrator to review your permissions.
          </p>
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
          <h1>Employees</h1>
          <p>
            Company-wise employee master. Creating an employee also
            creates its ERP login, exactly like the existing
            Company Management → Users screen.
          </p>
        </div>
      </div>


      <section className="company-panel">

        <div className="company-toolbar">
          <div>
            <h2>Employee directory</h2>
            <p>
              {employees.length} employee{employees.length === 1 ? '' : 's'} in
              your scope
            </p>
          </div>

          <Button onClick={openCreate}>+ Add employee</Button>
        </div>

        {error && !modalOpen && <Alert type="error">{error}</Alert>}

        <div className="company-user-tools">
          <Input
            label="Search employees"
            placeholder="Search by name, employee ID, designation or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="company-table-wrap">
          <table className="company-table company-user-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee ID</th>
                <th>Designation</th>
                <th>Company</th>
                <th>Department</th>
                <th>Status</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    <Spinner tone="brand" label="Loading employees..." />
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <strong>{employee.display_name}</strong>
                      <span className="company-address">
                        {employee.email || employee.username}
                      </span>
                    </td>

                    <td>{employee.employee_id || '\u2014'}</td>

                    <td>{employee.designation || '\u2014'}</td>

                    <td>
                      {employee.company ? (
                        <span className="company-code">
                          {employee.company.code}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>

                    <td>{employee.department?.name || '\u2014'}</td>

                    <td>
                      <span
                        className={
                          employee.is_active
                            ? 'company-status active'
                            : 'company-status inactive'
                        }
                      >
                        {employee.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="company-actions">
                      <button
                        type="button"
                        className="company-link"
                        onClick={() => openEdit(employee)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className={
                          employee.is_active
                            ? 'company-link danger'
                            : 'company-link'
                        }
                        onClick={() => changeStatus(employee)}
                      >
                        {employee.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>


      {modalOpen && (
        <div
          className="user-admin-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal()
            }
          }}
        >
          <div className="user-admin-modal">
            <div className="user-admin-modal-header">
              <div>
                <span className="company-eyebrow">HRMS</span>
                <h3>
                  {selectedEmployee
                    ? `Edit ${selectedEmployee.display_name}`
                    : 'Add Employee'}
                </h3>
              </div>

              <button
                type="button"
                className="user-admin-close"
                onClick={closeModal}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form className="user-admin-form" onSubmit={save}>
              {error && <Alert type="error">{error}</Alert>}

              <div className="user-admin-section">
                <h4>Account Information</h4>

                <div className="company-form-grid">
                  <Input
                    label="Username"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    disabled={Boolean(selectedEmployee)}
                    required
                  />

                  {!selectedEmployee && (
                    <Input
                      label="Temporary Password"
                      name="password"
                      type="password"
                      value={form.password}
                      onChange={handleChange}
                      minLength="8"
                      required
                    />
                  )}

                  <Input
                    label="First Name"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    required
                  />

                  <Input
                    label="Last Name"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                  />

                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                  />

                  <Input
                    label="Phone"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="user-admin-section">
                <h4>Employment Details</h4>

                <div className="company-form-grid">
                  <div className="field">
                    <label className="field-label">Company</label>
                    <select
                      className="field-input"
                      name="primary_company"
                      value={form.primary_company}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select company</option>
                      {companyOptions.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} ({company.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Role</label>
                    <select
                      className="field-input"
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      required
                    >
                      {ROLES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Department</label>
                    <select
                      className="field-input"
                      name="department"
                      value={form.department}
                      onChange={handleChange}
                    >
                      <option value="">No Department</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name} ({department.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {designationOptions.length > 0 ? (
                    <div className="field">
                      <label className="field-label">Designation</label>
                      <select
                        className="field-input"
                        name="designation"
                        value={form.designation}
                        onChange={handleChange}
                      >
                        <option value="">No designation</option>

                        {form.designation &&
                          !designationOptions.some(
                            (d) => d.name === form.designation
                          ) && (
                            <option value={form.designation}>
                              {form.designation} (not in master)
                            </option>
                          )}

                        {designationOptions.map((designation) => (
                          <option key={designation.id} value={designation.name}>
                            {designation.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Input
                      label="Designation"
                      name="designation"
                      value={form.designation}
                      onChange={handleChange}
                    />
                  )}

                  <Input
                    label="Employee ID"
                    name="employee_id"
                    value={form.employee_id}
                    onChange={handleChange}
                  />

                  <div className="field">
                    <label className="field-label">Joining Date</label>
                    <input
                      className="field-input"
                      type="date"
                      name="joining_date"
                      value={form.joining_date}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Employment Status</label>
                    <select
                      className="field-input"
                      name="employment_status"
                      value={form.employment_status}
                      onChange={handleChange}
                    >
                      {EMPLOYMENT_STATUS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Reporting Manager</label>
                    <select
                      className="field-input"
                      name="reporting_manager"
                      value={form.reporting_manager}
                      onChange={handleChange}
                    >
                      <option value="">No manager</option>
                      {managerOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Shift</label>
                    <select
                      className="field-input"
                      name="shift"
                      value={form.shift}
                      onChange={handleChange}
                    >
                      <option value="">No shift assigned</option>
                      {shifts
                        .filter(
                          (shift) =>
                            !shift.company ||
                            String(shift.company) === form.primary_company
                        )
                        .map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="user-admin-section">
                <h4>Bank &amp; Payment Details</h4>
                <p className="user-admin-help">
                  Optional. Used only for payroll if/when payroll is
                  approved as part of the final scope (US-HR-10.2).
                </p>

                <div className="company-form-grid">
                  <Input
                    label="Bank Name"
                    name="bank_name"
                    value={form.bank_name}
                    onChange={handleChange}
                  />

                  <Input
                    label="Account Number"
                    name="bank_account_number"
                    value={form.bank_account_number}
                    onChange={handleChange}
                  />

                  <Input
                    label="IFSC Code"
                    name="bank_ifsc"
                    value={form.bank_ifsc}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="user-admin-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </Button>

                <Button type="submit" loading={saving} loadingText="Saving...">
                  {selectedEmployee ? 'Save Changes' : 'Create Employee'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}