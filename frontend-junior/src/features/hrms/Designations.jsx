import { useEffect, useState, useMemo } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import PageHeader from '../../components/PageHeader'
import { getErrorMessage } from '../../utils/errors'

import Modal from '../inventory/components/Modal'
import { recordAudit } from '../../utils/audit'

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
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    setPage(1)
  }, [search, companyFilter, departmentFilter, statusFilter])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Assigned Staff inspection modal
  const [viewingStaffDesignation, setViewingStaffDesignation] = useState(null)

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

      setDesignations(Array.isArray(designationsResponse?.data) ? designationsResponse.data : Array.isArray(designationsResponse) ? designationsResponse : [])
      setCompanies((Array.isArray(companiesResponse?.data) ? companiesResponse.data : Array.isArray(companiesResponse) ? companiesResponse : []).filter((c) => c?.is_active))
      setDepartments((Array.isArray(departmentsResponse?.data) ? departmentsResponse.data : Array.isArray(departmentsResponse) ? departmentsResponse : []).filter((d) => d?.is_active))
      setEmployees(Array.isArray(employeesResponse?.data) ? employeesResponse.data : Array.isArray(employeesResponse) ? employeesResponse : [])
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
  const employeesOf = (designation) => {
    if (!designation) return []
    return employees.filter(
      (employee) =>
        sameText(employee.designation, designation.name) &&
        (!designation.company ||
          Number(employee.primary_company) ===
            Number(designation.company))
    )
  }

  const employeeCount = (designation) =>
    employeesOf(designation).length

  const isEditable = (designation) =>
    canShare || Boolean(designation.company)

  const query = search.trim().toLowerCase()

  const rows = useMemo(() => {
    return designations
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
        if (departmentFilter !== 'ALL') {
          return Number(designation.department) === Number(departmentFilter)
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
  }, [designations, companyFilter, departmentFilter, statusFilter, query, departments])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize)

  // KPI Calculations
  const activeCount = designations.filter((d) => d.is_active).length
  const inactiveCount = designations.length - activeCount
  const totalStaffAssigned = useMemo(() => {
    return employees.filter((e) =>
      designations.some((d) => sameText(e.designation, d.name))
    ).length
  }, [employees, designations])

  const hasActiveFilters = Boolean(
    search || companyFilter !== 'ALL' || departmentFilter !== 'ALL' || statusFilter !== 'ALL'
  )

  const resetFilters = () => {
    setSearch('')
    setCompanyFilter('ALL')
    setDepartmentFilter('ALL')
    setStatusFilter('ALL')
  }

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
    if (saving) return
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
      setError('Hierarchy level must be a whole number of 1 or more.')
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

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Designation',
          entityId: String(editing.id),
          referenceNumber: payload.name,
          action: 'UPDATE',
          before: {
            name: editing.name,
            code: editing.code,
            level: editing.level,
            department: editing.department,
            description: editing.description,
          },
          after: payload,
        })

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
        setSuccessMessage(`Designation "${payload.name}" updated successfully.`)
      } else {
        await hrService.createDesignation(payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Designation',
          entityId: payload.code || payload.name,
          referenceNumber: payload.name,
          action: 'CREATE',
          after: payload,
        })
        setSuccessMessage(`Designation "${payload.name}" created successfully.`)
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
      !window.confirm(
        `Are you sure you want to ${action} "${designation.name}"?`
      )
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

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Designation',
        entityId: String(designation.id),
        referenceNumber: designation.name,
        action: designation.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        before: { is_active: designation.is_active },
        after: { is_active: !designation.is_active },
      })

      setSuccessMessage(
        `Designation "${designation.name}" ${designation.is_active ? 'deactivated' : 'reactivated'} successfully.`
      )
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
      !window.confirm(
        `Delete "${designation.name}"? This cannot be undone.`
      )
    ) {
      return
    }

    setError('')

    try {
      await hrService.deleteDesignation(designation.id)

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Designation',
        entityId: String(designation.id),
        referenceNumber: designation.name,
        action: 'DELETE',
        before: designation,
      })

      setSuccessMessage(`Designation "${designation.name}" deleted successfully.`)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!canManage) {
    return (
      <div className="hr-page">
        <PageHeader
          breadcrumbs={[
            { label: 'HRMS', to: '/hrms' },
            { label: 'Designations' },
          ]}
          title="Designation Masters"
          subtitle="Maintain organizational job titles, hierarchy levels, company allocations, and department mapping."
        />
        <div className="hr-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', color: '#173b59' }}>Access Restricted</h2>
          <p style={{ color: '#6d859a', maxWidth: 480, margin: '0 auto' }}>
            Your current role does not have authorization to modify or view designation masters. Please contact your system administrator.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Designations' },
        ]}
        title="Designation Masters"
        subtitle="Maintain organizational job titles, hierarchy levels, company scopes, and departmental role mapping across units."
        primaryAction={{
          label: '+ Add Designation',
          onClick: openCreate,
        }}
      />

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Total Designations</span>
            <span style={{ fontSize: 18 }}>🏷️</span>
          </div>
          <div className="hr-kpi-val">{designations.length}</div>
          <div className="hr-kpi-sub">Registered job titles</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Active Titles</span>
            <span style={{ fontSize: 18 }}>✅</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="hr-kpi-sub">
            {designations.length > 0
              ? `${Math.round((activeCount / designations.length) * 100)}% operational rate`
              : '0 operational'}
          </div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Inactive Titles</span>
            <span style={{ fontSize: 18 }}>⏸️</span>
          </div>
          <div className="hr-kpi-val" style={{ color: inactiveCount > 0 ? '#d97706' : '#64748b' }}>
            {inactiveCount}
          </div>
          <div className="hr-kpi-sub">Archived or legacy roles</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Assigned Staff</span>
            <span style={{ fontSize: 18 }}>👥</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#0284c7' }}>{totalStaffAssigned}</div>
          <div className="hr-kpi-sub">Employees mapped across units</div>
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

      {/* TOOLBAR & FILTERS */}
      <div className="hr-toolbar">
        <div className="hr-search-box">
          <input
            type="text"
            placeholder="Search by title, code, department or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="hr-clear-search"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="hr-filter-item">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="ALL">All Companies</option>
            {canShare && <option value="SHARED">Shared (Both Companies)</option>}
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="hr-filter-item">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.code ? `(${d.code})` : ''}
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
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="hr-toolbar-actions">
            <button
              type="button"
              className="hr-clear-filters-btn"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* DESIGNATIONS TABLE CARD */}
      <div className="hr-table-card">
        <div className="hr-card-header" style={{ padding: '16px 20px', margin: 0 }}>
          <div>
            <h3 className="hr-card-title">Designation Roster</h3>
            <p className="hr-card-sub">
              Showing {rows.length} designation{rows.length === 1 ? '' : 's'} matching active filters
            </p>
          </div>
        </div>

        <div className="hr-table-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Designation Title</th>
                <th style={{ minWidth: 110 }}>Code</th>
                <th style={{ minWidth: 160 }}>Department</th>
                <th style={{ minWidth: 100 }}>Level</th>
                <th style={{ minWidth: 160 }}>Company Scope</th>
                <th style={{ minWidth: 120 }}>Assigned Staff</th>
                <th style={{ minWidth: 100 }}>Status</th>
                <th style={{ minWidth: 180, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" style={{ padding: 0 }}>
                    <div className="hr-skeleton-loader">
                      <div className="hr-skeleton-row" style={{ width: '100%' }} />
                      <div className="hr-skeleton-row" style={{ width: '90%' }} />
                      <div className="hr-skeleton-row" style={{ width: '95%' }} />
                    </div>
                  </td>
                </tr>
              )}

              {!loading && paginatedRows.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="hr-empty-state">
                      <div className="hr-empty-icon">🏷️</div>
                      <div className="hr-empty-title">
                        {designations.length === 0
                          ? 'No Designations Configured'
                          : 'No Designations Found'}
                      </div>
                      <p className="hr-empty-desc">
                        {designations.length === 0
                          ? 'Get started by creating designation titles for your organizational hierarchy.'
                          : 'Try modifying your search query or reset your company/department filters.'}
                      </p>
                      {hasActiveFilters && (
                        <Button
                          variant="secondary"
                          style={{ marginTop: 14 }}
                          onClick={resetFilters}
                        >
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                paginatedRows.map((designation) => {
                  const staffCount = employeeCount(designation)
                  return (
                    <tr key={designation.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {(designation.name?.[0] || 'D').toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ color: '#0f172a', fontSize: 13.5 }}>
                              {designation.name}
                            </strong>
                            {designation.description && (
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: '#64748b',
                                  marginTop: 2,
                                  lineHeight: 1.35,
                                  maxWidth: 320,
                                }}
                              >
                                {designation.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        {designation.code ? (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              background: '#f1f5f9',
                              color: '#334155',
                              padding: '3px 7px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            {designation.code}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>&mdash;</span>
                        )}
                      </td>

                      <td>
                        {departmentName(designation.department) ? (
                          <span
                            style={{
                              background: '#f0f9ff',
                              color: '#0369a1',
                              padding: '3px 9px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 600,
                              border: '1px solid #bae6fd',
                            }}
                          >
                            {departmentName(designation.department)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>
                            All Departments
                          </span>
                        )}
                      </td>

                      <td>
                        {designation.level !== null && designation.level !== undefined ? (
                          <span
                            style={{
                              background: '#faf5ff',
                              color: '#7e22ce',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: '1px solid #e9d5ff',
                            }}
                          >
                            Level {designation.level}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>&mdash;</span>
                        )}
                      </td>

                      <td>
                        {!designation.company ? (
                          <span
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 600,
                              border: '1px solid #fde68a',
                            }}
                          >
                            Shared (Both)
                          </span>
                        ) : (
                          <span style={{ color: '#334155', fontWeight: 600, fontSize: 12.5 }}>
                            {companyName(designation.company)}
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          onClick={() => setViewingStaffDesignation(designation)}
                          title="Click to view assigned employees"
                          style={{
                            cursor: 'pointer',
                            background: staffCount > 0 ? '#eff6ff' : '#f8fafc',
                            color: staffCount > 0 ? '#1d4ed8' : '#64748b',
                            border: staffCount > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            borderRadius: 20,
                            padding: '3px 10px',
                            fontSize: 11.5,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>👥</span>
                          <span>{staffCount} {staffCount === 1 ? 'staff' : 'staff'}</span>
                        </button>
                      </td>

                      <td>
                        <span
                          className={`hr-badge ${designation.is_active ? 'active' : 'inactive'}`}
                        >
                          {designation.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isEditable(designation) ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 6,
                            }}
                          >
                            <button
                              type="button"
                              className="table-edit"
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
                              style={{ padding: '4px 8px', fontSize: 12 }}
                            >
                              {designation.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>

                            <button
                              type="button"
                              className="table-delete"
                              onClick={() => remove(designation)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                            Shared &middot; View only
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="hr-pagination">
          <div>
            Showing{' '}
            <strong>
              {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong>
              {Math.min(page * pageSize, rows.length)}
            </strong>{' '}
            of <strong>{rows.length}</strong> designation{rows.length === 1 ? '' : 's'}
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

              <span
                style={{
                  padding: '0 8px',
                  fontWeight: 600,
                  color: '#1e293b',
                  fontSize: 12,
                }}
              >
                Page {page} of {totalPages}
              </span>

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

      {/* MODAL: ADD / EDIT DESIGNATION */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          maxWidth={640}
          title={editing ? 'Edit Designation Master' : 'Add New Designation'}
          onClose={closeModal}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save Changes' : 'Create Designation'}
              </Button>
            </div>
          }
        >
          {error && (
            <div style={{ marginBottom: 14 }}>
              <Alert type="error">{error}</Alert>
            </div>
          )}

          <form onSubmit={save}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* SECTION 1: TITLE & POSITION */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: '#1e293b',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>🏷️</span>
                  <span>Title &amp; Hierarchy</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <div>
                    <Input
                      label="Designation Name"
                      name="name"
                      placeholder="e.g. Senior Quality Chemist"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="Designation Code (optional)"
                      name="code"
                      placeholder="e.g. QC-CHEM-SR"
                      value={form.code}
                      onChange={handleChange}
                    />
                  </div>

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
                          {department.name} {department.code ? `(${department.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Input
                      label="Hierarchy Level (1 = Executive / Top)"
                      name="level"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 1, 2, 3..."
                      value={form.level}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: COMPANY SCOPE & DESCRIPTION */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: '#1e293b',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>🏢</span>
                  <span>Scope &amp; Role Summary</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label className="field-label">Operating Company</label>
                    <select
                      className="field-input"
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                      disabled={editingInUse}
                    >
                      {canShare && <option value="">Both Companies (Shared master)</option>}
                      {companyOptions.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>

                    {editingInUse && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#b45309',
                          marginTop: 5,
                          background: '#fffbeb',
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #fef3c7',
                        }}
                      >
                        Company assignment is locked because {employeeCount(editing)} active employee(s) currently hold this title.
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label className="field-label">Job Description / Responsibilities</label>
                    <textarea
                      className="field-input"
                      name="description"
                      rows="3"
                      placeholder="Brief overview of responsibilities and qualifications for this role..."
                      value={form.description}
                      onChange={handleChange}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>

              {/* CASCADE RENAME NOTICE */}
              {editing && editingInUse && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#0369a1',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    padding: '10px 14px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>ℹ️</span>
                  <span>
                    Renaming this title will automatically cascade and update the{' '}
                    <strong>{employeeCount(editing)}</strong> employee
                    {employeeCount(editing) === 1 ? '' : 's'} currently mapped to it.
                  </span>
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: VIEW ASSIGNED STAFF */}
      {viewingStaffDesignation && (
        <Modal
          isOpen={Boolean(viewingStaffDesignation)}
          maxWidth={760}
          title={`Assigned Staff — ${viewingStaffDesignation.name}`}
          onClose={() => setViewingStaffDesignation(null)}
          footer={
            <Button
              variant="secondary"
              onClick={() => setViewingStaffDesignation(null)}
            >
              Close
            </Button>
          }
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f8fafc',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                marginBottom: 16,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Designation Overview
                </span>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  {viewingStaffDesignation.name}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {viewingStaffDesignation.code && (
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#334155',
                    }}
                  >
                    {viewingStaffDesignation.code}
                  </span>
                )}
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {departmentName(viewingStaffDesignation.department) || 'Any Department'}
                </span>
                <span
                  style={{
                    background: viewingStaffDesignation.is_active ? '#dcfce7' : '#fee2e2',
                    color: viewingStaffDesignation.is_active ? '#15803d' : '#b91c1c',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {viewingStaffDesignation.is_active ? 'Active Master' : 'Inactive Master'}
                </span>
              </div>
            </div>

            {employeesOf(viewingStaffDesignation).length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 16px',
                  color: '#64748b',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>
                  No Employees Assigned
                </h4>
                <p style={{ margin: 0, fontSize: 13 }}>
                  No active or registered personnel currently hold this designation.
                </p>
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>ID</th>
                      <th>Company</th>
                      <th>Department</th>
                      <th>Email / Contact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeesOf(viewingStaffDesignation).map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: '#e0f2fe',
                                color: '#0369a1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 12.5,
                              }}
                            >
                              {(emp.first_name?.[0] || emp.display_name?.[0] || 'E').toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ color: '#0f172a' }}>
                                {emp.display_name || `${emp.first_name || ''} ${emp.last_name || ''}`}
                              </strong>
                              {emp.joining_date && (
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                  Joined {emp.joining_date}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              fontSize: 12,
                              color: '#334155',
                            }}
                          >
                            {emp.employee_id || '\u2014'}
                          </span>
                        </td>
                        <td>{emp.company?.name || companyName(emp.primary_company)}</td>
                        <td>{emp.department?.name || departmentName(emp.department) || 'General'}</td>
                        <td>
                          <div style={{ fontSize: 12, color: '#475569' }}>
                            {emp.email || emp.phone || '\u2014'}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`hr-badge ${emp.is_active ? 'active' : 'inactive'}`}
                          >
                            {emp.employment_status || (emp.is_active ? 'Active' : 'Inactive')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export { Designations }