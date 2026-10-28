import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageEmployees } from './permissions'
import { previewDocumentNumber, commitDocumentNumber } from '../../utils/documentNumbers'
import { formatDateTimeIN, maskAadhaar, maskBankAcc, maskPAN } from '../../utils/formatters'
import { logAudit, getEntityAuditLogs } from '../../utils/audit'

import PageHeader from '../../components/PageHeader'
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
  ['PROBATION', 'Probation'],
  ['NOTICE_PERIOD', 'Notice Period'],
  ['INACTIVE', 'Inactive'],
  ['RESIGNED', 'Resigned'],
  ['TERMINATED', 'Terminated'],
]

const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full Time'],
  ['PROBATION', 'Probation'],
  ['CONTRACT', 'Contract'],
  ['PART_TIME', 'Part Time'],
  ['INTERN', 'Intern'],
]

const GENDER_OPTIONS = [
  ['MALE', 'Male'],
  ['FEMALE', 'Female'],
  ['OTHER', 'Other'],
]

const EMPTY_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: 'MALE',
  dob: '',
  role: 'EMPLOYEE',
  primary_company: '',
  department: '',
  designation: '',
  employee_id: '',
  joining_date: '',
  employment_type: 'FULL_TIME',
  employment_status: 'ACTIVE',
  reporting_manager: '',
  shift: '',
  // Emergency Contact
  emergency_contact_name: '',
  emergency_contact_relation: '',
  emergency_contact_phone: '',
  // Bank Details
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  monthly_salary: '',
  // Statutory KYC
  pan: '',
  uan: '',
  aadhaar: '',
  photo_url: '',
  documents: [],
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
  const [successMessage, setSuccessMessage] = useState('')

  // Search & Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [designationFilter, setDesignationFilter] = useState('ALL')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'grid'

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Modals & Drawers
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState('personal') // 'personal', 'job', 'contact', 'bank_kyc', 'docs'
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // View Details Drawer
  const [viewingEmployee, setViewingEmployee] = useState(null)
  const [viewTab, setViewTab] = useState('overview') // 'overview', 'job', 'personal', 'documents', 'attendance', 'leave', 'payroll'
  const [viewHistory, setViewHistory] = useState([])


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

      setEmployees(employeesResponse.data || [])
      setCompanies((companiesResponse.data || []).filter((c) => c.is_active))
      setDepartments((departmentsResponse.data || []).filter((d) => d.is_active))
      setShifts((shiftsResponse.data || []).filter((s) => s.is_active))
      setDesignations((designationsResponse.data || []).filter((d) => d.is_active))
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

  useEffect(() => {
    setPage(1)
  }, [search, companyFilter, deptFilter, statusFilter, typeFilter, designationFilter])


  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies

  const designationOptions = designations.filter(
    (d) => !d.company || Number(d.company) === Number(form.primary_company)
  )

  const managerOptions = employees.filter(
    (employee) => !selectedEmployee || employee.id !== selectedEmployee.id
  )


  const openCreate = () => {
    setSelectedEmployee(null)
    const generatedEmpId = previewDocumentNumber('EMPLOYEE')

    setForm({
      ...EMPTY_FORM,
      primary_company: companyOptions[0] ? String(companyOptions[0].id) : '',
      employee_id: generatedEmpId,
      joining_date: new Date().toISOString().slice(0, 10),
    })

    setModalTab('personal')
    setError('')
    setSuccessMessage('')
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
      gender: employee.gender || 'MALE',
      dob: employee.dob || '',
      role: employee.role || 'EMPLOYEE',
      primary_company: employee.primary_company ? String(employee.primary_company) : '',
      department: employee.department ? String(employee.department.id || employee.department) : '',
      designation: employee.designation || '',
      employee_id: employee.employee_id || '',
      joining_date: employee.joining_date || '',
      employment_type: employee.employment_type || 'FULL_TIME',
      employment_status: employee.employment_status || 'ACTIVE',
      reporting_manager: employee.reporting_manager ? String(employee.reporting_manager) : '',
      shift: employee.shift ? String(employee.shift.id || employee.shift) : '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_relation: employee.emergency_contact_relation || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      bank_name: employee.bank_name || '',
      bank_account_number: employee.bank_account_number || '',
      bank_ifsc: employee.bank_ifsc || '',
      monthly_salary: employee.monthly_salary ?? '',
      pan: employee.pan || '',
      uan: employee.uan || '',
      aadhaar: employee.aadhaar || '',
      photo_url: employee.photo_url || '',
      documents: Array.isArray(employee.documents) ? employee.documents : [],
    })

    setModalTab('personal')
    setError('')
    setSuccessMessage('')
    setModalOpen(true)
  }


  const openView = (employee) => {
    setViewingEmployee(employee)
    setViewTab('overview')
    const history = getEntityAuditLogs('Employee', employee.employee_id || employee.id)
    setViewHistory(history)
  }


  const closeModal = () => {
    if (saving) return
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

  // Handle document attachment
  const handleAddDocument = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const newDoc = {
        id: `doc-${Date.now()}`,
        name: file.name,
        size: `${Math.round(file.size / 1024)} KB`,
        type: file.type || 'Document',
        uploaded_at: new Date().toISOString(),
        file_url: e.target.result,
      }
      setForm((curr) => ({
        ...curr,
        documents: [...(curr.documents || []), newDoc],
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveDocument = (docId) => {
    setForm((curr) => ({
      ...curr,
      documents: (curr.documents || []).filter((d) => d.id !== docId),
    }))
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.primary_company) {
      setError('Please select the employee’s company.')
      return
    }

    if (!form.first_name.trim()) {
      setError('First name is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      let finalEmpId = form.employee_id.trim()
      if (!selectedEmployee) {
        finalEmpId = commitDocumentNumber('EMPLOYEE')
      }

      const statusHistoryEntry = {
        status: form.employment_status,
        changed_at: new Date().toISOString(),
        changed_by: user?.username || 'Admin',
        reason: selectedEmployee ? 'Profile updated' : 'Initial employment setup',
      }

      const existingHistory = Array.isArray(selectedEmployee?.status_history)
        ? selectedEmployee.status_history
        : []

      const nextStatusHistory = selectedEmployee?.employment_status !== form.employment_status
        ? [...existingHistory, statusHistoryEntry]
        : existingHistory.length === 0
        ? [statusHistoryEntry]
        : existingHistory

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        dob: form.dob || null,
        role: form.role,
        primary_company: Number(form.primary_company),
        department: form.department ? Number(form.department) : null,
        designation: form.designation.trim(),
        employee_id: finalEmpId,
        joining_date: form.joining_date || null,
        employment_type: form.employment_type,
        employment_status: form.employment_status,
        status_history: nextStatusHistory,
        reporting_manager: form.reporting_manager ? Number(form.reporting_manager) : null,
        shift: form.shift ? Number(form.shift) : null,
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_relation: form.emergency_contact_relation.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        bank_name: form.bank_name.trim(),
        bank_account_number: form.bank_account_number.trim(),
        bank_ifsc: form.bank_ifsc.trim(),
        monthly_salary: form.monthly_salary === '' ? null : Number(form.monthly_salary),
        pan: form.pan.trim().toUpperCase(),
        uan: form.uan.trim(),
        aadhaar: form.aadhaar.trim(),
        photo_url: form.photo_url,
        documents: form.documents || [],
      }

      if (!selectedEmployee) {
        await hrService.createEmployee({
          ...payload,
          username: form.username.trim() || `emp_${finalEmpId.toLowerCase()}`,
          password: form.password || 'Temporary@1234',
          can_access_common_inventory: false,
        })

        logAudit({
          module: 'HRMS',
          entity_type: 'Employee',
          entity_id: finalEmpId,
          action: 'CREATE',
          description: `Created new employee ${payload.first_name} ${payload.last_name} (${finalEmpId})`,
          user,
          company: payload.primary_company,
        })

        setSuccessMessage('Employee added successfully.')
      } else {
        await hrService.updateEmployee(selectedEmployee.id, payload)

        logAudit({
          module: 'HRMS',
          entity_type: 'Employee',
          entity_id: finalEmpId,
          action: 'UPDATE',
          description: `Updated employee profile for ${payload.first_name} ${payload.last_name} (${finalEmpId})`,
          user,
          company: payload.primary_company,
        })

        setSuccessMessage('Employee updated successfully.')
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

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${employee.display_name}?`
    )

    if (!confirmed) return

    setError('')

    try {
      if (employee.is_active) {
        await hrService.deactivateEmployee(employee.id)
      } else {
        await hrService.reactivateEmployee(employee.id)
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'Employee',
        entity_id: employee.employee_id || String(employee.id),
        action: employee.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        description: `${employee.is_active ? 'Deactivated' : 'Reactivated'} employee ${employee.display_name}`,
        user,
        company: employee.primary_company,
      })

      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const removeEmployee = async (employee) => {
    // Check if other employees report to this employee
    const subordinates = employees.filter((e) => Number(e.reporting_manager) === Number(employee.id))
    if (subordinates.length > 0) {
      setError(
        `Cannot delete ${employee.display_name}: ${subordinates.length} employee(s) report to them. Reassign reporting manager or deactivate instead.`
      )
      return
    }

    const confirmed = window.confirm(
      `Archive and remove employee "${employee.display_name}" (${employee.employee_id})? This will archive their ERP record.`
    )

    if (!confirmed) return

    setError('')

    try {
      await hrService.deleteEmployee(employee.id)

      logAudit({
        module: 'HRMS',
        entity_type: 'Employee',
        entity_id: employee.employee_id || String(employee.id),
        action: 'DELETE',
        description: `Archived/Deleted employee ${employee.display_name} (${employee.employee_id})`,
        user,
        company: employee.primary_company,
      })

      setSuccessMessage(`Employee ${employee.display_name} archived.`)
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  // Filter & Search
  const filtered = useMemo(() => {
    return employees
      .filter((emp) => {
        if (companyFilter !== 'ALL') {
          return Number(emp.primary_company) === Number(companyFilter)
        }
        return true
      })
      .filter((emp) => {
        if (deptFilter !== 'ALL') {
          return Number(emp.department?.id || emp.department) === Number(deptFilter)
        }
        return true
      })
      .filter((emp) => {
        if (designationFilter !== 'ALL') {
          return emp.designation === designationFilter
        }
        return true
      })
      .filter((emp) => {
        if (statusFilter === 'ACTIVE') return emp.is_active
        if (statusFilter === 'INACTIVE') return !emp.is_active
        if (statusFilter !== 'ALL') return emp.employment_status === statusFilter
        return true
      })
      .filter((emp) => {
        if (typeFilter !== 'ALL') {
          return (emp.employment_type || 'FULL_TIME') === typeFilter
        }
        return true
      })
      .filter((emp) => {
        const query = search.trim().toLowerCase()
        if (!query) return true

        const text = [
          emp.display_name,
          emp.employee_id,
          emp.designation,
          emp.email,
          emp.phone,
          emp.role_label,
          emp.department?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(query)
      })
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
  }, [employees, companyFilter, deptFilter, designationFilter, statusFilter, typeFilter, search])

  const kpis = useMemo(() => {
    const total = employees.length
    const active = employees.filter((e) => e.is_active).length
    const depts = new Set(employees.map((e) => e.department?.name || e.department).filter(Boolean)).size
    const probationOrContract = employees.filter(
      (e) => e.employment_status === 'PROBATION' || e.employment_type === 'CONTRACT' || e.employment_type === 'PROBATION'
    ).length
    return { total, active, depts, probationOrContract }
  }, [employees])

  const hasActiveFilters = Boolean(
    search || companyFilter !== 'ALL' || deptFilter !== 'ALL' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || designationFilter !== 'ALL'
  )

  const resetFilters = () => {
    setSearch('')
    setCompanyFilter('ALL')
    setDeptFilter('ALL')
    setStatusFilter('ALL')
    setTypeFilter('ALL')
    setDesignationFilter('ALL')
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedEmployees = filtered.slice((page - 1) * pageSize, page * pageSize)


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>Employees</h1>
          <p>
            Your current role does not have access to the employee master.
            Ask an HR Administrator to review your permissions.
          </p>
        </section>
      </div>
    )
  }


  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Employees' }
        ]}
        title="Employee Directory"
        subtitle="Manage personal profiles, roles, KYC credentials, shifts, and departmental assignments."
        primaryAction={{
          label: '+ Add Employee',
          onClick: openCreate
        }}
      />

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Total Employees</span>
            <span style={{ fontSize: 18 }}>👥</span>
          </div>
          <div className="hr-kpi-val">{kpis.total}</div>
          <div className="hr-kpi-sub">Registered across all units</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Active Roster</span>
            <span style={{ fontSize: 18 }}>✅</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#16a34a' }}>{kpis.active}</div>
          <div className="hr-kpi-sub">
            {kpis.total > 0 ? `${Math.round((kpis.active / kpis.total) * 100)}% active rate` : '0 active'}
          </div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Departments</span>
            <span style={{ fontSize: 18 }}>🏢</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#0284c7' }}>{kpis.depts}</div>
          <div className="hr-kpi-sub">Functional departments</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Probation &amp; Contract</span>
            <span style={{ fontSize: 18 }}>⏳</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#d97706' }}>{kpis.probationOrContract}</div>
          <div className="hr-kpi-sub">Under review / fixed term</div>
        </div>
      </div>

      {error && !modalOpen && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}
      {successMessage && !modalOpen && (
        <div style={{ marginBottom: 16 }}>
          <Alert
            type="success"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
          />
        </div>
      )}

      {/* MAIN DATA SECTION */}
      <div className="hr-table-card">
        {/* TOOLBAR */}
        <div className="hr-toolbar">
          <div className="hr-search-box">
            <span className="hr-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, ID, designation, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="hr-filter-item">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="ALL">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
            >
              <option value="ALL">All Designations</option>
              {Array.from(new Set([...designations.map((d) => d.title || d.name), ...employees.map((e) => e.designation)].filter(Boolean)))
                .sort()
                .map((desig) => (
                  <option key={desig} value={desig}>
                    {desig}
                  </option>
                ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All Types</option>
              {EMPLOYMENT_TYPES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
              {EMPLOYMENT_STATUS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="hr-clear-filter"
              onClick={resetFilters}
              title="Reset all search and filter conditions"
            >
              ✕ Clear filters
            </button>
          )}

          <div className="hr-toolbar-actions">
            <div className="hr-view-toggle">
              <button
                type="button"
                className={`hr-view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                📋 Table
              </button>
              <button
                type="button"
                className={`hr-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid / Card view"
              >
                🪟 Cards
              </button>
            </div>
          </div>
        </div>

        {/* LOADING SKELETON */}
        {loading && (
          <div className="hr-skeleton-loader">
            <div className="hr-skeleton-row" style={{ width: '100%', height: 32 }} />
            <div className="hr-skeleton-row" style={{ width: '92%' }} />
            <div className="hr-skeleton-row" style={{ width: '96%' }} />
            <div className="hr-skeleton-row" style={{ width: '88%' }} />
            <div className="hr-skeleton-row" style={{ width: '94%' }} />
          </div>
        )}

        {/* TABLE VIEW */}
        {!loading && viewMode === 'table' && (
          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Designation &amp; Dept</th>
                  <th>Shift</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Joining Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.map((employee) => {
                  const statusClass = !employee.is_active
                    ? 'inactive'
                    : employee.employment_status === 'PROBATION'
                    ? 'probation'
                    : employee.employment_status === 'NOTICE_PERIOD'
                    ? 'pending'
                    : 'active'

                  return (
                    <tr key={employee.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="hr-emp-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                            {(employee.first_name?.[0] || employee.username?.[0] || 'E').toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                              {employee.display_name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {employee.email || employee.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="company-code" style={{ fontWeight: 700 }}>
                          {employee.employee_id || '—'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                          {employee.designation || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {employee.department?.name || 'General'}
                        </div>
                      </td>

                      <td>
                        {employee.shift?.name ? (
                          <span className="hr-badge neutral" style={{ fontSize: 11 }}>
                            ⏰ {employee.shift.name}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>Unassigned</span>
                        )}
                      </td>

                      <td>
                        {employee.company ? (
                          <span className="company-code" style={{ fontSize: 11 }}>
                            {employee.company.code}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td>
                        <span className={`hr-badge ${statusClass}`}>
                          {employee.employment_status || (employee.is_active ? 'Active' : 'Inactive')}
                        </span>
                      </td>

                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {employee.joining_date || '—'}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => openView(employee)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="table-edit"
                            onClick={() => openEdit(employee)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={employee.is_active ? 'company-link danger' : 'company-link'}
                            onClick={() => changeStatus(employee)}
                          >
                            {employee.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() => removeEmployee(employee)}
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="8">
                      <div className="hr-empty-state">
                        <div className="hr-empty-icon">👥</div>
                        <div className="hr-empty-title">No employees found</div>
                        <div className="hr-empty-desc">
                          {employees.length === 0
                            ? 'No employees are registered in the directory yet. Click "+ Add Employee" above to create the first record.'
                            : 'No employees match the selected filters. Try resetting the search terms or filters.'}
                        </div>
                        {hasActiveFilters && (
                          <Button
                            variant="secondary"
                            style={{ marginTop: 14 }}
                            onClick={resetFilters}
                          >
                            Reset filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* CARD / GRID VIEW */}
        {!loading && viewMode === 'grid' && (
          <div>
            {filtered.length === 0 ? (
              <div className="hr-empty-state">
                <div className="hr-empty-icon">👥</div>
                <div className="hr-empty-title">No employees found</div>
                <div className="hr-empty-desc">
                  {employees.length === 0
                    ? 'No employees registered yet. Click "+ Add Employee" to create one.'
                    : 'No employees match the selected filters.'}
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="secondary"
                    style={{ marginTop: 14 }}
                    onClick={resetFilters}
                  >
                    Reset filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="hr-grid-cards">
                {paginatedEmployees.map((employee) => {
                  const statusClass = !employee.is_active
                    ? 'inactive'
                    : employee.employment_status === 'PROBATION'
                    ? 'probation'
                    : employee.employment_status === 'NOTICE_PERIOD'
                    ? 'pending'
                    : 'active'

                  return (
                    <div key={employee.id} className="hr-emp-card">
                      <div className="hr-emp-card-top">
                        <div className="hr-emp-avatar">
                          {(employee.first_name?.[0] || employee.username?.[0] || 'E').toUpperCase()}
                        </div>
                        <div className="hr-emp-card-info">
                          <div className="hr-emp-card-name" title={employee.display_name}>
                            {employee.display_name}
                          </div>
                          <div className="hr-emp-card-meta">
                            {employee.employee_id} &middot; {employee.company?.code || '—'}
                          </div>
                        </div>
                        <span className={`hr-badge ${statusClass}`}>
                          {employee.employment_status || (employee.is_active ? 'Active' : 'Inactive')}
                        </span>
                      </div>

                      <div className="hr-emp-card-rows">
                        <div className="hr-emp-card-row">
                          <span className="hr-emp-card-label">Designation:</span>
                          <strong>{employee.designation || '—'}</strong>
                        </div>
                        <div className="hr-emp-card-row">
                          <span className="hr-emp-card-label">Department:</span>
                          <span>{employee.department?.name || 'General'}</span>
                        </div>
                        <div className="hr-emp-card-row">
                          <span className="hr-emp-card-label">Type:</span>
                          <span>{employee.employment_type || 'Full Time'}</span>
                        </div>
                        <div className="hr-emp-card-row">
                          <span className="hr-emp-card-label">Joined:</span>
                          <span>{employee.joining_date || '—'}</span>
                        </div>
                      </div>

                      <div className="hr-emp-card-actions">
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => openView(employee)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="table-edit"
                          onClick={() => openEdit(employee)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={employee.is_active ? 'company-link danger' : 'company-link'}
                          onClick={() => changeStatus(employee)}
                        >
                          {employee.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PAGINATION */}
        <div className="hr-pagination">
          <div>
            Showing <strong>{filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}</strong> to{' '}
            <strong>{Math.min(page * pageSize, filtered.length)}</strong> of{' '}
            <strong>{filtered.length}</strong> employee{filtered.length === 1 ? '' : 's'}
          </div>

          {totalPages > 1 && (
            <div className="hr-pagination-btns">
              <button
                type="button"
                className="hr-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                &larr; Prev
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1
                if (
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  Math.abs(pageNum - page) <= 1
                ) {
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={`hr-page-btn ${page === pageNum ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  )
                }
                if (pageNum === 2 && page > 3) {
                  return <span key="dots-1" style={{ padding: '0 4px' }}>&hellip;</span>
                }
                if (pageNum === totalPages - 1 && page < totalPages - 2) {
                  return <span key="dots-2" style={{ padding: '0 4px' }}>&hellip;</span>
                }
                return null
              })}
              <button
                type="button"
                className="hr-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div
          className="company-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal()
            }
          }}
        >
          <div
            className="company-modal user-management-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 840 }}
          >
            <div className="company-modal-header">
              <div>
                <div className="modal-context-label">HRMS MASTER</div>
                <h3>
                  {selectedEmployee
                    ? `Edit Profile: ${selectedEmployee.display_name}`
                    : 'Add New Employee'}
                </h3>
              </div>

              <button
                type="button"
                className="company-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR FOR FORM SECTIONS */}
            <div className="hr-tabs" style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className={modalTab === 'personal' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('personal')}
              >
                1. Personal Details
              </button>
              <button
                type="button"
                className={modalTab === 'employment' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('employment')}
              >
                2. Employment &amp; Schedule
              </button>
              <button
                type="button"
                className={modalTab === 'bank_kyc' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('bank_kyc')}
              >
                3. Bank &amp; Statutory KYC
              </button>
              <button
                type="button"
                className={modalTab === 'docs' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setModalTab('docs')}
              >
                4. Documents ({form.documents?.length || 0})
              </button>
            </div>

            <form className="company-form user-management-form" onSubmit={save}>
              {error && (
                <div className="user-modal-alert">
                  <Alert type="error" message={error} />
                </div>
              )}

              {/* TAB 1: PERSONAL & EMERGENCY */}
              {modalTab === 'personal' && (
                <div className="company-form-section">
                  <div className="company-form-grid">
                    <Input
                      label="Employee ID (Auto-generated)"
                      name="employee_id"
                      value={form.employee_id}
                      disabled
                      readOnly
                    />

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
                        label="Initial Password"
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        minLength="6"
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

                    <div className="field">
                      <label className="field-label">Gender</label>
                      <select
                        className="field-input"
                        name="gender"
                        value={form.gender}
                        onChange={handleChange}
                      >
                        {GENDER_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Date of Birth</label>
                      <input
                        className="field-input"
                        type="date"
                        name="dob"
                        value={form.dob}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2', marginTop: 10, paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: 13, color: '#173b59' }}>Emergency Contact Information</strong>
                    </div>

                    <Input
                      label="Emergency Contact Name"
                      name="emergency_contact_name"
                      value={form.emergency_contact_name}
                      onChange={handleChange}
                    />

                    <Input
                      label="Relationship"
                      name="emergency_contact_relation"
                      placeholder="e.g. Spouse, Father, Sibling"
                      value={form.emergency_contact_relation}
                      onChange={handleChange}
                    />

                    <Input
                      label="Emergency Phone"
                      name="emergency_contact_phone"
                      value={form.emergency_contact_phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: EMPLOYMENT & SCHEDULE */}
              {modalTab === 'employment' && (
                <div className="company-form-section">
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
                      <label className="field-label">ERP Access Role</label>
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

                    <div className="field">
                      <label className="field-label">Designation</label>
                      <select
                        className="field-input"
                        name="designation"
                        value={form.designation}
                        onChange={handleChange}
                      >
                        <option value="">No designation</option>
                        {designationOptions.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="field-label">Assigned Shift</label>
                      <select
                        className="field-input"
                        name="shift"
                        value={form.shift}
                        onChange={handleChange}
                      >
                        <option value="">No shift assigned</option>
                        {shifts
                          .filter(
                            (s) => !s.company || String(s.company) === form.primary_company
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.start_time} - {s.end_time})
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
                        <option value="">No Manager</option>
                        {managerOptions.map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.display_name} ({mgr.employee_id || mgr.username})
                          </option>
                        ))}
                      </select>
                    </div>

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
                      <label className="field-label">Employment Type</label>
                      <select
                        className="field-input"
                        name="employment_type"
                        value={form.employment_type}
                        onChange={handleChange}
                      >
                        {EMPLOYMENT_TYPES.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
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

                    <Input
                      label="Monthly Gross Salary (₹)"
                      name="monthly_salary"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 35000"
                      value={form.monthly_salary}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: BANK & STATUTORY KYC */}
              {modalTab === 'bank_kyc' && (
                <div className="company-form-section">
                  <div className="company-form-grid">
                    <Input
                      label="Bank Name"
                      name="bank_name"
                      placeholder="e.g. State Bank of India, HDFC"
                      value={form.bank_name}
                      onChange={handleChange}
                    />

                    <Input
                      label="Account Number"
                      name="bank_account_number"
                      placeholder="Full account number"
                      value={form.bank_account_number}
                      onChange={handleChange}
                    />

                    <Input
                      label="IFSC Code"
                      name="bank_ifsc"
                      placeholder="e.g. SBIN0001234"
                      value={form.bank_ifsc}
                      onChange={handleChange}
                    />

                    <div className="field" style={{ gridColumn: 'span 2', marginTop: 10, paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: 13, color: '#173b59' }}>Statutory KYC Identifiers</strong>
                    </div>

                    <Input
                      label="PAN Card Number"
                      name="pan"
                      placeholder="e.g. ABCDE1234F"
                      maxLength="10"
                      value={form.pan}
                      onChange={handleChange}
                    />

                    <Input
                      label="Aadhaar Number"
                      name="aadhaar"
                      placeholder="12-digit Aadhaar number"
                      maxLength="12"
                      value={form.aadhaar}
                      onChange={handleChange}
                    />

                    <Input
                      label="UAN Number (PF)"
                      name="uan"
                      placeholder="Universal Account Number"
                      maxLength="12"
                      value={form.uan}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: DOCUMENTS & ATTACHMENTS */}
              {modalTab === 'docs' && (
                <div className="company-form-section">
                  <div style={{ marginBottom: 14 }}>
                    <label className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                      Upload Identity / Resume / Contract Documents
                    </label>
                    <input
                      type="file"
                      onChange={handleAddDocument}
                      className="field-input"
                      style={{ padding: 6 }}
                    />
                  </div>

                  <div className="company-table-wrap">
                    <table className="company-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Size</th>
                          <th>Uploaded At</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.documents || []).length === 0 ? (
                          <tr>
                            <td colSpan="4" className="company-empty">
                              No documents uploaded yet. Choose a file above.
                            </td>
                          </tr>
                        ) : (
                          form.documents.map((doc) => (
                            <tr key={doc.id}>
                              <td><strong>{doc.name}</strong></td>
                              <td>{doc.size}</td>
                              <td>{formatDateTimeIN(doc.uploaded_at)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="company-link danger"
                                  onClick={() => handleRemoveDocument(doc.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="company-modal-actions" style={{ marginTop: 20 }}>
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

      {/* VIEW EMPLOYEE DETAILS MODAL */}
      {viewingEmployee && (
        <div
          className="company-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingEmployee(null)
          }}
        >
          <div
            className="company-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 840 }}
          >
            <div className="company-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {(viewingEmployee.first_name?.[0] || viewingEmployee.username?.[0] || 'E').toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{viewingEmployee.display_name}</h3>
                  <div style={{ fontSize: 12, color: '#6d859a', marginTop: 3 }}>
                    {viewingEmployee.employee_id} &middot; {viewingEmployee.designation || 'Unassigned'} &middot; {viewingEmployee.company?.name}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="company-modal-close"
                onClick={() => setViewingEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="hr-tabs" style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 4 }}>
              <button
                type="button"
                className={viewTab === 'overview' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                className={viewTab === 'job' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('job')}
              >
                Job Details
              </button>
              <button
                type="button"
                className={viewTab === 'personal' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('personal')}
              >
                Personal
              </button>
              <button
                type="button"
                className={viewTab === 'documents' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('documents')}
              >
                Documents ({viewingEmployee.documents?.length || 0})
              </button>
              <button
                type="button"
                className={viewTab === 'attendance' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('attendance')}
              >
                Attendance
              </button>
              <button
                type="button"
                className={viewTab === 'leave' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('leave')}
              >
                Leave
              </button>
              <button
                type="button"
                className={viewTab === 'payroll' ? 'hr-tab active' : 'hr-tab'}
                onClick={() => setViewTab('payroll')}
              >
                Payroll
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {viewTab === 'overview' && (
              <div className="hr-detail-grid">
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Employee ID</span>
                  <strong className="hr-detail-val">{viewingEmployee.employee_id || '—'}</strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Employment Status</span>
                  <span className={`hr-badge ${viewingEmployee.is_active ? 'active' : 'inactive'}`}>
                    {viewingEmployee.employment_status || (viewingEmployee.is_active ? 'Active' : 'Inactive')}
                  </span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Work Email</span>
                  <span className="hr-detail-val">{viewingEmployee.email || viewingEmployee.username || '—'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Primary Phone</span>
                  <span className="hr-detail-val">{viewingEmployee.phone || '—'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Department</span>
                  <span className="hr-detail-val">{viewingEmployee.department?.name || 'General Operations'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Designation</span>
                  <span className="hr-detail-val">{viewingEmployee.designation || 'Staff'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Operating Company</span>
                  <span className="hr-detail-val">{viewingEmployee.company?.name || 'Primary Company'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Date of Joining</span>
                  <span className="hr-detail-val">{viewingEmployee.joining_date || '—'}</span>
                </div>
              </div>
            )}

            {/* TAB 2: JOB DETAILS */}
            {viewTab === 'job' && (
              <div className="hr-detail-grid">
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Employment Type</span>
                  <span className="hr-detail-val">{viewingEmployee.employment_type || 'Full Time'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">System Role</span>
                  <span className="hr-detail-val">{viewingEmployee.role_label || viewingEmployee.role || 'Employee'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Assigned Shift</span>
                  <span className="hr-detail-val">{viewingEmployee.shift?.name || 'Standard Day Shift (09:00 - 18:00)'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Reporting Manager</span>
                  <span className="hr-detail-val">{viewingEmployee.reporting_manager_name || 'Direct to HR / Management'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Probation / Notice</span>
                  <span className="hr-detail-val">{viewingEmployee.employment_status || 'Active Roster'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Inventory Access</span>
                  <span className="hr-detail-val">{viewingEmployee.can_access_common_inventory ? 'Authorized' : 'Restricted to Unit'}</span>
                </div>
              </div>
            )}

            {/* TAB 3: PERSONAL */}
            {viewTab === 'personal' && (
              <div className="hr-detail-grid">
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Legal Name</span>
                  <span className="hr-detail-val">{viewingEmployee.first_name} {viewingEmployee.last_name || ''}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Gender</span>
                  <span className="hr-detail-val">{viewingEmployee.gender || 'Not specified'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Date of Birth</span>
                  <span className="hr-detail-val">{viewingEmployee.dob || '—'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Emergency Contact Name</span>
                  <span className="hr-detail-val">{viewingEmployee.emergency_contact_name || 'None provided'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Emergency Relationship</span>
                  <span className="hr-detail-val">{viewingEmployee.emergency_contact_relation || '—'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Emergency Phone</span>
                  <span className="hr-detail-val">{viewingEmployee.emergency_contact_phone || '—'}</span>
                </div>
              </div>
            )}

            {/* TAB 4: DOCUMENTS */}
            {viewTab === 'documents' && (
              <div>
                {(viewingEmployee.documents || []).length === 0 ? (
                  <div className="hr-empty-state" style={{ padding: '24px 0' }}>
                    <div className="hr-empty-icon">📁</div>
                    <div className="hr-empty-title">No documents attached</div>
                    <div className="hr-empty-desc">Identity cards, resumes, and signed contracts can be uploaded during profile edits.</div>
                  </div>
                ) : (
                  <div className="hr-table-scroll">
                    <table className="hr-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Size</th>
                          <th>Uploaded At</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingEmployee.documents.map((doc) => (
                          <tr key={doc.id}>
                            <td><strong>📄 {doc.name}</strong></td>
                            <td>{doc.size || '—'}</td>
                            <td>{formatDateTimeIN(doc.uploaded_at)}</td>
                            <td><span className="hr-badge present">Verified</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: ATTENDANCE */}
            {viewTab === 'attendance' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>PRESENT DAYS</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 4 }}>22</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 700 }}>ABSENT DAYS</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>1</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#854d0e', fontWeight: 700 }}>LATE PUNCHES</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#a16207', marginTop: 4 }}>2</div>
                  </div>
                </div>
                <div className="hr-emp-card-rows">
                  <div className="hr-emp-card-row">
                    <span className="hr-emp-card-label">Assigned Shift:</span>
                    <strong>{viewingEmployee.shift?.name || 'General Shift (09:00 - 18:00)'}</strong>
                  </div>
                  <div className="hr-emp-card-row">
                    <span className="hr-emp-card-label">Grace Period:</span>
                    <span>15 Minutes</span>
                  </div>
                  <div className="hr-emp-card-row">
                    <span className="hr-emp-card-label">Biometric ID:</span>
                    <span className="company-code">{viewingEmployee.employee_id}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: LEAVE */}
            {viewTab === 'leave' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700 }}>CASUAL LEAVE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8', marginTop: 4 }}>8 / 12</div>
                    <div style={{ fontSize: 11, color: '#60a5fa' }}>4 used</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>SICK LEAVE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d', marginTop: 4 }}>10 / 10</div>
                    <div style={{ fontSize: 11, color: '#4ade80' }}>0 used</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#6b21a8', fontWeight: 700 }}>EARNED LEAVE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#7e22ce', marginTop: 4 }}>14 / 15</div>
                    <div style={{ fontSize: 11, color: '#c084fc' }}>1 used</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: PAYROLL */}
            {viewTab === 'payroll' && (
              <div className="hr-detail-grid">
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Monthly Gross Salary</span>
                  <strong className="hr-detail-val" style={{ color: '#16a34a', fontSize: 15 }}>
                    {viewingEmployee.monthly_salary != null
                      ? `₹${Number(viewingEmployee.monthly_salary).toLocaleString('en-IN')}`
                      : '—'}
                  </strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Salary Mode</span>
                  <span className="hr-detail-val">Direct Bank Transfer (NEFT/RTGS)</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Bank Name</span>
                  <strong className="hr-detail-val">{viewingEmployee.bank_name || '—'}</strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Bank Account (Masked)</span>
                  <strong className="hr-detail-val">{viewingEmployee.bank_account_number ? maskBankAcc(viewingEmployee.bank_account_number) : '—'}</strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Bank IFSC Code</span>
                  <span className="hr-detail-val">{viewingEmployee.bank_ifsc || '—'}</span>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">PAN Number (Masked)</span>
                  <strong className="hr-detail-val">{viewingEmployee.pan ? maskPAN(viewingEmployee.pan) : '—'}</strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">Aadhaar (Masked)</span>
                  <strong className="hr-detail-val">{viewingEmployee.aadhaar ? maskAadhaar(viewingEmployee.aadhaar) : '—'}</strong>
                </div>
                <div className="hr-detail-field">
                  <span className="hr-detail-label">UAN Number (PF)</span>
                  <span className="hr-detail-val">{viewingEmployee.uan || '—'}</span>
                </div>
              </div>
            )}

            <div className="company-modal-actions" style={{ marginTop: 24 }}>
              <Button onClick={() => setViewingEmployee(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}