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
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  grace_minutes: 10,
  half_day_hours: 4.5,
  is_overnight: false,
  weekly_off: 'Sunday',
  company: '',
}

function calculateWorkingHours(startTime, endTime, breakMinutes = 60, isOvernight = false) {
  if (!startTime || !endTime) return '8.0'
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let startMinutes = (sh || 0) * 60 + (sm || 0)
  let endMinutes = (eh || 0) * 60 + (em || 0)
  if (isOvernight || endMinutes < startMinutes) {
    endMinutes += 1440
  }
  const netMinutes = Math.max(0, endMinutes - startMinutes - (Number(breakMinutes) || 0))
  return (netMinutes / 60).toFixed(1)
}

function formatTime12(time24) {
  if (!time24) return '—'
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

export default function Shifts() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [shifts, setShifts] = useState([])
  const [companies, setCompanies] = useState([])
  const [employees, setEmployees] = useState([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [shiftsResponse, companiesResponse, employeesResponse] = await Promise.all([
        hrService.getShifts(scopedCompanies),
        companyService.getCompanies(),
        hrService.getEmployees(scopedCompanies),
      ])

      setShifts(Array.isArray(shiftsResponse?.data) ? shiftsResponse.data : Array.isArray(shiftsResponse) ? shiftsResponse : [])
      setCompanies((Array.isArray(companiesResponse?.data) ? companiesResponse.data : Array.isArray(companiesResponse) ? companiesResponse : []).filter((c) => c?.is_active))
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

  useEffect(() => {
    setPage(1)
  }, [search, companyFilter, statusFilter])

  const companyName = (id) => {
    if (!id) return 'Both companies'
    return companies.find((c) => Number(c.id) === Number(id))?.name || '—'
  }

  const assignedCount = (shiftId) => {
    return employees.filter(
      (emp) => Number(emp.shift?.id ?? emp.shift) === Number(shiftId)
    ).length
  }

  // Filtered rows
  const query = search.trim().toLowerCase()
  const rows = useMemo(() => {
    return shifts
      .filter((shift) => {
        if (companyFilter === 'SHARED') return !shift.company
        if (companyFilter !== 'ALL') {
          return !shift.company || Number(shift.company) === Number(companyFilter)
        }
        return true
      })
      .filter((shift) => {
        if (statusFilter === 'ACTIVE') return shift.is_active
        if (statusFilter === 'INACTIVE') return !shift.is_active
        return true
      })
      .filter((shift) => {
        if (!query) return true
        return (
          shift.name?.toLowerCase().includes(query) ||
          shift.weekly_off?.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [shifts, companyFilter, statusFilter, query])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize)

  // KPI Calculations
  const activeCount = shifts.filter((s) => s.is_active).length
  const totalAssignedStaff = useMemo(() => {
    return employees.filter((emp) => emp.shift).length
  }, [employees])

  const avgWorkingHours = useMemo(() => {
    if (shifts.length === 0) return '8.0'
    const total = shifts.reduce((acc, s) => {
      const h = Number(calculateWorkingHours(s.start_time, s.end_time, s.break_minutes, s.is_overnight))
      return acc + (isNaN(h) ? 8 : h)
    }, 0)
    return (total / shifts.length).toFixed(1)
  }, [shifts])

  const hasActiveFilters = Boolean(
    search || companyFilter !== 'ALL' || statusFilter !== 'ALL'
  )

  const resetFilters = () => {
    setSearch('')
    setCompanyFilter('ALL')
    setStatusFilter('ALL')
    setPage(1)
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
      half_day_hours: shift.half_day_hours ?? 4.5,
      is_overnight: Boolean(shift.is_overnight),
      weekly_off: shift.weekly_off || 'Sunday',
      company: shift.company ? String(shift.company) : '',
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
    const { name, value, type, checked } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const save = async (event) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Shift name is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        break_minutes: Number(form.break_minutes) || 0,
        grace_minutes: Number(form.grace_minutes) || 0,
        half_day_hours: Number(form.half_day_hours) || 4.5,
        is_overnight: Boolean(form.is_overnight),
        weekly_off: form.weekly_off.trim() || 'Sunday',
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateShift(editing.id, payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Shift',
          entityId: String(editing.id),
          referenceNumber: payload.name,
          action: 'UPDATE',
          before: editing,
          after: payload,
        })
        setSuccessMessage(`Shift "${payload.name}" updated successfully.`)
      } else {
        await hrService.createShift(payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Shift',
          entityId: payload.name,
          referenceNumber: payload.name,
          action: 'CREATE',
          after: payload,
        })
        setSuccessMessage(`Shift "${payload.name}" created successfully.`)
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

    if (!window.confirm(`Are you sure you want to ${action} "${shift.name}"?`)) {
      return
    }

    setError('')

    try {
      if (shift.is_active) {
        await hrService.deactivateShift(shift.id)
      } else {
        await hrService.reactivateShift(shift.id)
      }

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Shift',
        entityId: String(shift.id),
        referenceNumber: shift.name,
        action: shift.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        before: { is_active: shift.is_active },
        after: { is_active: !shift.is_active },
      })

      setSuccessMessage(
        `Shift "${shift.name}" ${shift.is_active ? 'deactivated' : 'reactivated'} successfully.`
      )
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const remove = async (shift) => {
    const inUse = assignedCount(shift.id)

    if (inUse > 0) {
      setError(
        `"${shift.name}" is assigned to ${inUse} employee${inUse === 1 ? '' : 's'}. Deactivate it instead of deleting.`
      )
      return
    }

    if (!window.confirm(`Delete "${shift.name}"? This cannot be undone.`)) {
      return
    }

    setError('')

    try {
      await hrService.deleteShift(shift.id)

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Shift',
        entityId: String(shift.id),
        referenceNumber: shift.name,
        action: 'DELETE',
        before: shift,
      })

      setSuccessMessage(`Shift "${shift.name}" deleted successfully.`)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // Non-manager view: My Assigned Shift
  if (!canManage) {
    const myEmployee =
      employees.find(
        (e) =>
          Number(e.id) === Number(user?.id) ||
          e.email === user?.email ||
          e.username === user?.username
      ) || user

    const fullName =
      myEmployee?.display_name ||
      `${myEmployee?.first_name || ''} ${myEmployee?.last_name || ''}`.trim() ||
      myEmployee?.full_name ||
      myEmployee?.username ||
      'Employee'

    const designation =
      myEmployee?.designation_name ||
      myEmployee?.designation?.title ||
      myEmployee?.designation ||
      myEmployee?.profile?.designation ||
      'Staff Member'

    const myShiftId =
      myEmployee?.shift?.id ??
      myEmployee?.shift ??
      myEmployee?.profile?.shift

    const myShift =
      shifts.find((s) => Number(s.id) === Number(myShiftId)) ||
      (typeof myEmployee?.shift === 'object' ? myEmployee?.shift : null)

    const shiftName = myShift?.name || 'General Shift'
    const shiftTimings =
      myShift?.start_time && myShift?.end_time
        ? `${formatTime12(myShift.start_time)} – ${formatTime12(myShift.end_time)}`
        : '09:00 AM – 06:00 PM'

    return (
      <div className="hr-page">
        <PageHeader
          breadcrumbs={[
            { label: 'HRMS', to: '/hrms' },
            { label: 'My Shift' },
          ]}
          title="My Assigned Shift"
          subtitle="Your operational work schedule, duty hours, break allocations, and weekly off days."
        />

        <div className="hr-card" style={{ maxWidth: 680 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: '#e0f2fe',
                color: '#0369a1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {(fullName[0] || 'E').toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>{fullName}</h2>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                Designation: <strong style={{ color: '#0284c7' }}>{designation}</strong>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 16,
              padding: '16px 20px',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Shift Schedule
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {shiftName}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Duty Timings
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                🕒 {shiftTimings}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Weekly Off
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginTop: 4 }}>
                {myShift?.weekly_off || 'Sunday'}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Admin / HR Management view
  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Shifts' },
        ]}
        title="Shift Masters"
        subtitle="Configure standard, overnight, and custom shift schedules, timings, break durations, and staff allocations."
        primaryAction={{
          label: '+ Add Shift',
          onClick: openCreate,
        }}
      />

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Total Shifts</span>
            <span style={{ fontSize: 18 }}>🕒</span>
          </div>
          <div className="hr-kpi-val">{shifts.length}</div>
          <div className="hr-kpi-sub">Configured duty schedules</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Active Shifts</span>
            <span style={{ fontSize: 18 }}>✅</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#16a34a' }}>{activeCount}</div>
          <div className="hr-kpi-sub">
            {shifts.length > 0 ? `${Math.round((activeCount / shifts.length) * 100)}% operational` : '0 active'}
          </div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Assigned Staff</span>
            <span style={{ fontSize: 18 }}>👥</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#0284c7' }}>{totalAssignedStaff}</div>
          <div className="hr-kpi-sub">Employees on roster</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Standard Duty</span>
            <span style={{ fontSize: 18 }}>⏱️</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#6366f1' }}>{avgWorkingHours} hrs</div>
          <div className="hr-kpi-sub">Average net working time</div>
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
            placeholder="Search by shift name, weekly off..."
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
            <option value="SHARED">Shared (Both Companies)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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

      {/* SHIFTS TABLE CARD */}
      <div className="hr-table-card">
        <div className="hr-card-header" style={{ padding: '16px 20px', margin: 0 }}>
          <div>
            <h3 className="hr-card-title">Shift Roster</h3>
            <p className="hr-card-sub">
              Showing {rows.length} shift schedule{rows.length === 1 ? '' : 's'} matching criteria
            </p>
          </div>
        </div>

        <div className="hr-table-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Shift Name</th>
                <th style={{ minWidth: 160 }}>Timings (Start &ndash; End)</th>
                <th style={{ minWidth: 110 }}>Break</th>
                <th style={{ minWidth: 120 }}>Working Hours</th>
                <th style={{ minWidth: 150 }}>Grace / Half-Day</th>
                <th style={{ minWidth: 110 }}>Weekly Off</th>
                <th style={{ minWidth: 150 }}>Company Scope</th>
                <th style={{ minWidth: 120 }}>Assigned Staff</th>
                <th style={{ minWidth: 100 }}>Status</th>
                <th style={{ minWidth: 160, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="10" style={{ padding: 0 }}>
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
                  <td colSpan="10">
                    <div className="hr-empty-state">
                      <div className="hr-empty-icon">🕒</div>
                      <div className="hr-empty-title">
                        {shifts.length === 0 ? 'No Shifts Configured' : 'No Matching Shifts'}
                      </div>
                      <p className="hr-empty-desc">
                        {shifts.length === 0
                          ? 'Get started by creating work shifts with duty hours, break times, and grace thresholds.'
                          : 'Try modifying your search query or reset your company/status filters.'}
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
                paginatedRows.map((shift) => {
                  const staffCount = assignedCount(shift.id)
                  const netHours = calculateWorkingHours(
                    shift.start_time,
                    shift.end_time,
                    shift.break_minutes,
                    shift.is_overnight
                  )

                  return (
                    <tr key={shift.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              background: shift.is_overnight ? '#ede9fe' : '#e0f2fe',
                              color: shift.is_overnight ? '#6d28d9' : '#0369a1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {shift.is_overnight ? '🌙' : '☀️'}
                          </div>
                          <div>
                            <strong style={{ color: '#0f172a', fontSize: 13.5 }}>
                              {shift.name}
                            </strong>
                            {shift.is_overnight && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginLeft: 6,
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: '#f3e8ff',
                                  color: '#7e22ce',
                                  fontWeight: 700,
                                }}
                              >
                                Overnight
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                          {formatTime12(shift.start_time)} &ndash; {formatTime12(shift.end_time)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          {shift.start_time} - {shift.end_time} (24h)
                        </div>
                      </td>

                      <td>
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {shift.break_minutes ?? 60}m break
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            background: '#f0fdf4',
                            color: '#15803d',
                            padding: '3px 9px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            border: '1px solid #bbf7d0',
                          }}
                        >
                          {netHours} hrs/day
                        </span>
                      </td>

                      <td style={{ fontSize: 12, color: '#475569' }}>
                        <div>Grace: <strong>{shift.grace_minutes ?? 10}m</strong></div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Half-day: {shift.half_day_hours ?? 4.5}h
                        </div>
                      </td>

                      <td>
                        <span
                          style={{
                            background: '#f8fafc',
                            color: '#334155',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11.5,
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {shift.weekly_off || 'Sunday'}
                        </span>
                      </td>

                      <td>
                        {!shift.company ? (
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
                            {companyName(shift.company)}
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          style={{
                            background: staffCount > 0 ? '#eff6ff' : '#f8fafc',
                            color: staffCount > 0 ? '#1d4ed8' : '#64748b',
                            border: staffCount > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            borderRadius: 20,
                            padding: '3px 10px',
                            fontSize: 11.5,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          👥 {staffCount} staff
                        </span>
                      </td>

                      <td>
                        <span
                          className={`hr-badge ${shift.is_active ? 'active' : 'inactive'}`}
                        >
                          {shift.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                            onClick={() => openEdit(shift)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              shift.is_active ? 'company-link danger' : 'company-link'
                            }
                            onClick={() => changeStatus(shift)}
                            style={{ padding: '4px 8px', fontSize: 12 }}
                          >
                            {shift.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>

                          <button
                            type="button"
                            className="table-delete"
                            onClick={() => remove(shift)}
                          >
                            Delete
                          </button>
                        </div>
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
            of <strong>{rows.length}</strong> shift{rows.length === 1 ? '' : 's'}
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

      {/* ADD / EDIT SHIFT MODAL */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          maxWidth={640}
          title={editing ? 'Edit Shift Schedule' : 'Add New Shift'}
          onClose={closeModal}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save Changes' : 'Create Shift'}
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
              {/* SECTION 1: TIMINGS & SCHEDULE */}
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
                  <span>🕒</span>
                  <span>Shift Timings &amp; Schedule</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Input
                      label="Shift Name"
                      name="name"
                      placeholder="e.g. Standard General Shift"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="Start Time"
                      name="start_time"
                      type="time"
                      value={form.start_time}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="End Time"
                      name="end_time"
                      type="time"
                      value={form.end_time}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Weekly Off</label>
                    <select
                      className="field-input"
                      name="weekly_off"
                      value={form.weekly_off}
                      onChange={handleChange}
                    >
                      <option value="Sunday">Sunday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Friday">Friday</option>
                      <option value="Rotational">Rotational</option>
                      <option value="None">None</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      <input
                        type="checkbox"
                        name="is_overnight"
                        checked={form.is_overnight}
                        onChange={handleChange}
                        style={{ width: 16, height: 16 }}
                      />
                      Overnight Shift (Crosses Midnight)
                    </label>
                  </div>
                </div>

                {/* Net working hours preview */}
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#15803d',
                    fontSize: 12.5,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Scheduled Duration: {formatTime12(form.start_time)} – {formatTime12(form.end_time)}</span>
                  <span>Net Working Time: {calculateWorkingHours(form.start_time, form.end_time, form.break_minutes, form.is_overnight)} hrs/day</span>
                </div>
              </div>

              {/* SECTION 2: ATTENDANCE POLICIES & THRESHOLDS */}
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
                  <span>⚙️</span>
                  <span>Break Times &amp; Thresholds</span>
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
                      label="Break Duration (minutes)"
                      name="break_minutes"
                      type="number"
                      min="0"
                      step="5"
                      value={form.break_minutes}
                      onChange={handleChange}
                    />
                  </div>

                  <div>
                    <Input
                      label="Grace Period (minutes)"
                      name="grace_minutes"
                      type="number"
                      min="0"
                      step="1"
                      value={form.grace_minutes}
                      onChange={handleChange}
                    />
                  </div>

                  <div>
                    <Input
                      label="Half-Day Threshold (hours)"
                      name="half_day_hours"
                      type="number"
                      min="1"
                      step="0.5"
                      value={form.half_day_hours}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Company Allocation</label>
                    <select
                      className="field-input"
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                    >
                      <option value="">Both Companies (Shared)</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
export { Shifts }