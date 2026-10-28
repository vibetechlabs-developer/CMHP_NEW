import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import PageHeader from '../../components/PageHeader'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'

import { hrService } from './hrService'
import {
  allowedCompanyIds,
  canApproveLeave,
  canManageMasters,
} from './permissions'
import { logAudit } from '../../utils/audit'

import '../companies/Companies.css'
import './Hrms.css'

const EMPTY_APPLY_FORM = {
  leave_type: '',
  from_date: '',
  to_date: '',
  is_half_day: false,
  reason: '',
}

const EMPTY_TYPE_FORM = {
  name: '',
  code: '',
  paid: true,
  max_days_per_year: 12,
  carry_forward: true,
  company: '',
}


function calculateWorkingLeaveDays(from, to, isHalfDay, holidays = []) {
  if (!from || !to) return 0
  if (isHalfDay) return 0.5

  const start = new Date(from)
  const end = new Date(to)
  if (end < start) return 0

  let workingDays = 0
  const curr = new Date(start)

  const holidayDateSet = new Set(holidays.map((h) => h.date))

  while (curr <= end) {
    const dayOfWeek = curr.getDay() // 0 = Sunday
    const dateStr = curr.toISOString().slice(0, 10)

    // Exclude Sundays and official holidays
    if (dayOfWeek !== 0 && !holidayDateSet.has(dateStr)) {
      workingDays++
    }
    curr.setDate(curr.getDate() + 1)
  }

  return workingDays
}


export default function Leave() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canApprove = canApproveLeave(user)
  const canManage = canManageMasters(user)
  const myCompany = user?.profile?.primary_company

  const [leaveTypes, setLeaveTypes] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [teamRequests, setTeamRequests] = useState([])
  const [holidays, setHolidays] = useState([])
  const [employees, setEmployees] = useState([])

  // Tab & Modal navigation
  const [activeTab, setActiveTab] = useState('requests') // 'requests' | 'balances' | 'types' | 'calendar'
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [detailModalRequest, setDetailModalRequest] = useState(null)
  const [requestScope, setRequestScope] = useState(canApprove ? 'team' : 'mine')

  // Search & Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedEmpId, setSelectedEmpId] = useState(String(user?.id || ''))
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

  const [applyForm, setApplyForm] = useState(EMPTY_APPLY_FORM)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [teamError, setTeamError] = useState('')

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM)
  const [savingType, setSavingType] = useState(false)
  const [typeError, setTypeError] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = async () => {
    setLoading(true)
    setError('')

    try {
      const promises = [
        hrService.getLeaveTypes(scopedCompanies),
        hrService.getMyLeaveRequests(user.id),
        hrService.getHolidays(scopedCompanies),
      ]

      if (canApprove) {
        promises.push(hrService.getLeaveRequests(scopedCompanies, null))
        promises.push(hrService.getEmployees(scopedCompanies))
      }

      const results = await Promise.all(promises)
      setLeaveTypes(Array.isArray(results[0]?.data) ? results[0].data : [])
      setMyRequests(Array.isArray(results[1]?.data) ? results[1].data : [])
      setHolidays(Array.isArray(results[2]?.data) ? results[2].data : [])

      if (canApprove) {
        setTeamRequests(Array.isArray(results[3]?.data) ? results[3].data : [])
        setEmployees(Array.isArray(results[4]?.data) ? results[4].data : [])
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const activeLeaveTypes = leaveTypes.filter(
    (type) =>
      type.is_active &&
      (!type.company || Number(type.company) === Number(myCompany))
  )

  // Compute Leave Balances for logged-in user for the current calendar year
  const currentYear = new Date().getFullYear().toString()

  const balances = useMemo(() => {
    const map = {}
    activeLeaveTypes.forEach((type) => {
      const quota = Number(type.max_days_per_year) || 0
      const approvedTaken = myRequests
        .filter(
          (req) =>
            Number(req.leave_type) === Number(type.id) &&
            req.status === 'APPROVED' &&
            req.from_date &&
            req.from_date.startsWith(currentYear)
        )
        .reduce((sum, req) => sum + (Number(req.days) || 0), 0)

      map[type.id] = {
        name: type.name,
        code: type.code,
        paid: type.paid,
        quota,
        taken: approvedTaken,
        balance: Math.max(0, quota - approvedTaken),
      }
    })
    return map
  }, [activeLeaveTypes, myRequests, currentYear])


  // Days count for active apply form
  const requestedDays = useMemo(() => {
    return calculateWorkingLeaveDays(
      applyForm.from_date,
      applyForm.to_date,
      applyForm.is_half_day,
      holidays
    )
  }, [applyForm.from_date, applyForm.to_date, applyForm.is_half_day, holidays])


  const submitApply = async (event) => {
    event.preventDefault()
    setApplying(true)
    setApplyError('')

    try {
      if (!applyForm.leave_type) {
        throw new Error('Please select a leave type.')
      }

      if (requestedDays <= 0) {
        throw new Error(
          'Please select a valid working date range (holidays and Sundays are excluded).'
        )
      }

      const selectedType = activeLeaveTypes.find(
        (t) => Number(t.id) === Number(applyForm.leave_type)
      )

      // Balance check for paid leaves
      if (selectedType && selectedType.paid) {
        const balObj = balances[selectedType.id]
        if (balObj && requestedDays > balObj.balance) {
          throw new Error(
            `Insufficient leave balance. You requested ${requestedDays} day(s), but only have ${balObj.balance} day(s) remaining for ${selectedType.name}.`
          )
        }
      }

      // Overlap check
      const overlap = myRequests.find((req) => {
        if (req.status === 'REJECTED' || req.status === 'CANCELLED') return false
        return (
          applyForm.from_date <= req.to_date &&
          applyForm.to_date >= req.from_date
        )
      })

      if (overlap) {
        throw new Error(
          `You already have a ${overlap.status.toLowerCase()} leave request covering this period (${overlap.from_date} to ${overlap.to_date}).`
        )
      }

      await hrService.submitLeaveRequest({
        user: user.id,
        company: myCompany,
        leave_type: Number(applyForm.leave_type),
        from_date: applyForm.from_date,
        to_date: applyForm.to_date,
        days: requestedDays,
        reason: applyForm.reason.trim(),
        is_half_day: applyForm.is_half_day,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: `LV-${Date.now()}`,
        action: 'APPLY',
        description: `Applied for ${requestedDays} days ${selectedType?.name || 'Leave'} (${applyForm.from_date} to ${applyForm.to_date})`,
        user,
      })

      setApplyForm(EMPTY_APPLY_FORM)
      setSuccessMsg('Leave request submitted successfully.')
      await loadAll()
    } catch (err) {
      setApplyError(getErrorMessage(err) || err.message || 'Unable to submit leave request.')
    } finally {
      setApplying(false)
    }
  }


  const cancelMine = async (request) => {
    if (!window.confirm(`Cancel leave request for ${request.days} day(s)?`)) {
      return
    }

    setError('')
    try {
      await hrService.cancelLeaveRequest(request.id)

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: String(request.id),
        action: 'CANCEL',
        description: `Cancelled leave request #${request.id} (${request.from_date} to ${request.to_date})`,
        user,
      })

      setSuccessMsg('Leave request cancelled.')
      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  // Approve / Reject with remarks and automatic sync to Attendance
  const decide = async (request, status) => {
    let note = ''
    if (status === 'REJECTED') {
      note = window.prompt('Reason/remarks for rejection:') || ''
      if (note === null) return // cancelled prompt
    } else {
      note = window.prompt('Approval remarks (optional):') || 'Approved by HR/Manager'
    }

    setTeamError('')
    try {
      await hrService.decideLeaveRequest(request.id, status, user.id, note)

      // When APPROVED: Sync leave days to Attendance
      if (status === 'APPROVED') {
        const start = new Date(request.from_date)
        const end = new Date(request.to_date)
        const curr = new Date(start)

        while (curr <= end) {
          if (curr.getDay() !== 0) { // exclude Sunday
            const dayStr = curr.toISOString().slice(0, 10)
            await hrService.markAttendance({
              user: request.user,
              company: request.company,
              date: dayStr,
              status: 'LEAVE',
            })
          }
          curr.setDate(curr.getDate() + 1)
        }
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'Leave',
        entity_id: String(request.id),
        action: status,
        description: `${status} leave request for ${request.employee_name} (${request.days} days, ${request.from_date} to ${request.to_date}). Remarks: ${note}`,
        user,
      })

      setSuccessMsg(`Leave request #${request.id} ${status.toLowerCase()}.`)
      await loadAll()
    } catch (err) {
      setTeamError(getErrorMessage(err))
    }
  }


  const openCreateType = () => {
    setTypeForm(EMPTY_TYPE_FORM)
    setTypeError('')
    setTypeModalOpen(true)
  }


  const saveType = async (event) => {
    event.preventDefault()
    setSavingType(true)
    setTypeError('')

    try {
      const name = typeForm.name.trim()
      const code = typeForm.code.trim().toUpperCase()

      if (!name) throw new Error('Leave type name is required.')
      if (!code) throw new Error('Leave type code is required.')

      await hrService.createLeaveType({
        name,
        code,
        paid: Boolean(typeForm.paid),
        max_days_per_year: Number(typeForm.max_days_per_year) || 0,
        carry_forward: Boolean(typeForm.carry_forward),
        company: typeForm.company ? Number(typeForm.company) : null,
      })

      logAudit({
        module: 'HRMS',
        entity_type: 'LeaveType',
        entity_id: code,
        action: 'CREATE',
        description: `Configured new leave type: ${name} (${code})`,
        user,
      })

      setTypeModalOpen(false)
      setSuccessMsg(`Leave type "${name}" created successfully.`)
      await loadAll()
    } catch (err) {
      setTypeError(getErrorMessage(err) || err.message || 'Unable to create leave type.')
    } finally {
      setSavingType(false)
    }
  }


  const toggleTypeStatus = async (type) => {
    try {
      if (type.is_default) {
        setError('Default leave types cannot be deactivated.')
        return
      }

      if (type.is_active) {
        await hrService.deactivateLeaveType(type.id)
      } else {
        await hrService.reactivateLeaveType(type.id)
      }

      logAudit({
        module: 'HRMS',
        entity_type: 'LeaveType',
        entity_id: String(type.id),
        action: type.is_active ? 'DEACTIVATE' : 'REACTIVATE',
        description: `${type.is_active ? 'Deactivated' : 'Reactivated'} leave type ${type.name}`,
        user,
      })

      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  // Filtered Requests for Tab 1
  const allRequests = requestScope === 'team' ? teamRequests : myRequests

  const filteredRequests = useMemo(() => {
    return allRequests
      .filter((req) => {
        if (statusFilter !== 'ALL') {
          return req.status === statusFilter
        }
        return true
      })
      .filter((req) => {
        if (typeFilter !== 'ALL') {
          return Number(req.leave_type) === Number(typeFilter)
        }
        return true
      })
      .filter((req) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return [
          req.employee_name,
          req.employee_code,
          req.leave_type_name,
          req.reason,
          req.from_date,
          req.to_date,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => (b.created_at || b.from_date || '').localeCompare(a.created_at || a.from_date || ''))
  }, [allRequests, statusFilter, typeFilter, search])

  const hasActiveFilters = Boolean(search || statusFilter !== 'ALL' || typeFilter !== 'ALL')
  const resetFilters = () => {
    setSearch('')
    setStatusFilter('ALL')
    setTypeFilter('ALL')
  }

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const total = allRequests.length
    const pending = allRequests.filter((r) => r.status === 'PENDING').length
    const approved = allRequests.filter((r) => r.status === 'APPROVED').length
    const totalRemaining = Object.values(balances).reduce((acc, b) => acc + (b.balance || 0), 0)
    return { total, pending, approved, totalRemaining }
  }, [allRequests, balances])

  // Calendar tab days
  const calendarDays = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${selectedMonth}-${String(d).padStart(2, '0')}`
      days.push(dayStr)
    }
    return days
  }, [selectedMonth])

  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Leave' }
        ]}
        title="Leave Management"
        subtitle="Manage leave balances, submit vacation or sick leave, process team approvals, and configure leave policies."
        primaryAction={{
          label: '+ Apply Leave',
          onClick: () => {
            setApplyError('')
            setApplyModalOpen(true)
          },
        }}
      />

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Total Requests</span><span>📋</span></div>
          <div className="hr-kpi-val">{kpiStats.total}</div>
          <div className="hr-kpi-sub">{requestScope === 'team' ? 'Team applications' : 'My applications'}</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Pending Action</span><span>⏳</span></div>
          <div className="hr-kpi-val" style={{ color: '#d97706' }}>{kpiStats.pending}</div>
          <div className="hr-kpi-sub">Awaiting manager approval</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Approved Leaves</span><span>✅</span></div>
          <div className="hr-kpi-val" style={{ color: '#16a34a' }}>{kpiStats.approved}</div>
          <div className="hr-kpi-sub">Synced to attendance roster</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Available Leave Balance</span><span>🌴</span></div>
          <div className="hr-kpi-val" style={{ color: '#0284c7' }}>{kpiStats.totalRemaining} days</div>
          <div className="hr-kpi-sub">Paid quota available to take</div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {teamError && <Alert type="error">{teamError}</Alert>}
      {successMsg && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="success" message={successMsg} onDismiss={() => setSuccessMsg('')} />
        </div>
      )}

      {/* 4 MAIN NAVIGATION TABS */}
      <div className="hr-tabs" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={activeTab === 'requests' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('requests')}
        >
          Leave Requests ({allRequests.filter((r) => r.status === 'PENDING').length} pending)
        </button>
        <button
          type="button"
          className={activeTab === 'balances' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('balances')}
        >
          Leave Balances
        </button>
        <button
          type="button"
          className={activeTab === 'types' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('types')}
        >
          Leave Types Master
        </button>
        <button
          type="button"
          className={activeTab === 'calendar' ? 'hr-tab active' : 'hr-tab'}
          onClick={() => setActiveTab('calendar')}
        >
          Leave Calendar
        </button>
      </div>

      {/* =========================================================
          TAB 1: REQUESTS
          ========================================================= */}
      {activeTab === 'requests' && (
        <div className="hr-table-card">
          <div className="hr-toolbar">
            <div className="hr-search-box">
              <span className="hr-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search employee, reason, leave type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="hr-filter-item">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="hr-filter-item">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Leave Types</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="hr-clear-filter"
                onClick={resetFilters}
              >
                ✕ Clear filters
              </button>
            )}

            {canApprove && (
              <div className="hr-toolbar-actions">
                <div className="hr-view-toggle">
                  <button
                    type="button"
                    className={`hr-view-toggle-btn ${requestScope === 'team' ? 'active' : ''}`}
                    onClick={() => setRequestScope('team')}
                  >
                    👥 Team Approvals
                  </button>
                  <button
                    type="button"
                    className={`hr-view-toggle-btn ${requestScope === 'mine' ? 'active' : ''}`}
                    onClick={() => setRequestScope('mine')}
                  >
                    👤 My Requests
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>Dates (From &ndash; To)</th>
                  <th>Working Days</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const statusLower = String(request.status || '').toLowerCase()
                  const badgeClass =
                    request.status === 'APPROVED'
                      ? 'approved'
                      : request.status === 'PENDING'
                      ? 'pending'
                      : request.status === 'REJECTED'
                      ? 'rejected'
                      : 'neutral'

                  return (
                    <tr key={request.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="hr-emp-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                            {(request.employee_name?.[0] || 'E').toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                              {request.employee_name || user.username}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {request.employee_code || `EMP-${request.user}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong style={{ color: '#1e293b' }}>
                          {request.leave_type_name || 'Leave'}
                        </strong>
                        {request.is_half_day && (
                          <span className="hr-badge half-day" style={{ marginLeft: 6, fontSize: 10 }}>
                            Half Day
                          </span>
                        )}
                      </td>

                      <td>
                        <div>{request.from_date} &rarr; {request.to_date}</div>
                      </td>

                      <td>
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>
                          {request.days} day{request.days === 1 ? '' : 's'}
                        </strong>
                      </td>

                      <td>
                        <span className={`hr-badge ${badgeClass}`}>
                          {request.status}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: '#475569' }}>
                          {request.reason || '—'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => setDetailModalRequest(request)}
                          >
                            Details
                          </button>

                          {canApprove && request.status === 'PENDING' && requestScope === 'team' && (
                            <>
                              <button
                                type="button"
                                className="company-link"
                                style={{ color: '#16a34a' }}
                                onClick={() => decide(request, 'APPROVED')}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="company-link danger"
                                onClick={() => decide(request, 'REJECTED')}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {request.status === 'PENDING' && requestScope === 'mine' && (
                            <button
                              type="button"
                              className="company-link danger"
                              onClick={() => cancelMine(request)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan="7">
                      <div className="hr-empty-state">
                        <div className="hr-empty-icon">🏖️</div>
                        <div className="hr-empty-title">No leave requests found</div>
                        <div className="hr-empty-desc">
                          {allRequests.length === 0
                            ? 'No leave requests recorded yet. Click "+ Apply Leave" to request time off.'
                            : 'No leave requests match the selected filters.'}
                        </div>
                        {hasActiveFilters && (
                          <Button variant="secondary" style={{ marginTop: 12 }} onClick={resetFilters}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: LEAVE BALANCES WITH PROGRESS BARS
          ========================================================= */}
      {activeTab === 'balances' && (
        <div className="hr-table-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800 }}>
                Leave Balance Entitlements ({currentYear})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
                Annual quota breakdown with consumed days and available balance.
              </p>
            </div>

            <Button onClick={() => setApplyModalOpen(true)}>+ Apply for Leave</Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 18,
            }}
          >
            {Object.values(balances).map((bal) => {
              const usedPct = bal.quota > 0 ? Math.min(100, Math.round((bal.taken / bal.quota) * 100)) : 0
              const remainingPct = 100 - usedPct

              return (
                <div
                  key={bal.code}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    boxShadow: '0 2px 10px rgba(36, 93, 128, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#1e293b' }}>
                        {bal.name}
                      </h4>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Code: <strong>{bal.code}</strong> &middot; {bal.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>

                    <span
                      style={{
                        padding: '3px 8px',
                        background: bal.balance > 0 ? '#dcfce7' : '#fee2e2',
                        color: bal.balance > 0 ? '#15803d' : '#b91c1c',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {bal.balance > 0 ? `${bal.balance} left` : 'Exhausted'}
                    </span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>
                        {bal.balance}
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginLeft: 4 }}>
                          / {bal.quota} days
                        </span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                        {usedPct}% used
                      </span>
                    </div>

                    {/* PROGRESS BAR */}
                    <div
                      style={{
                        width: '100%',
                        height: 8,
                        background: '#f1f5f9',
                        borderRadius: 999,
                        overflow: 'hidden',
                        display: 'flex',
                      }}
                    >
                      <div
                        style={{
                          width: `${usedPct}%`,
                          background: usedPct > 80 ? '#dc2626' : '#f59e0b',
                          transition: 'width 0.3s ease',
                        }}
                      />
                      <div
                        style={{
                          width: `${remainingPct}%`,
                          background: '#0284c7',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: '#475569',
                      paddingTop: 10,
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <span>Consumed: <strong>{bal.taken} days</strong></span>
                    <span>Remaining: <strong>{bal.balance} days</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 3: LEAVE TYPES MASTER
          ========================================================= */}
      {activeTab === 'types' && (
        <div className="hr-table-card">
          <div className="hr-toolbar">
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#1e293b' }}>
                Leave Policy Master
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>
                Configure company-wide quotas, paid/unpaid classification, and carry-forward rules.
              </p>
            </div>

            {canManage && (
              <Button onClick={openCreateType}>+ Add Leave Type</Button>
            )}
          </div>

          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Leave Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Annual Quota</th>
                  <th>Carry Forward</th>
                  <th>Status</th>
                  {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((type) => (
                  <tr key={`${type.code}-${type.id}`}>
                    <td><strong>{type.name}</strong></td>
                    <td><span className="company-code">{type.code}</span></td>
                    <td>
                      <span className={`hr-badge ${type.paid ? 'present' : 'neutral'}`}>
                        {type.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td><strong>{type.max_days_per_year} days/yr</strong></td>
                    <td>{type.carry_forward ? '✅ Allowed' : '❌ Expiring'}</td>
                    <td>
                      <span className={`hr-badge ${type.is_active ? 'active' : 'inactive'}`}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className={type.is_active ? 'company-link danger' : 'company-link'}
                          onClick={() => toggleTypeStatus(type)}
                        >
                          {type.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 4: LEAVE CALENDAR
          ========================================================= */}
      {activeTab === 'calendar' && (
        <div className="hr-table-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: '#1e293b' }}>
                Team Leave Calendar
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>
                Approved leaves scheduled for month {selectedMonth}.
              </p>
            </div>

            <input
              type="month"
              className="company-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 10,
            }}
          >
            {calendarDays.map((dayStr) => {
              const dayNum = parseInt(dayStr.slice(8), 10)
              const dayLeaves = (canApprove ? teamRequests : myRequests).filter(
                (r) => r.status === 'APPROVED' && dayStr >= r.from_date && dayStr <= r.to_date
              )
              const isWeekend = new Date(dayStr).getDay() === 0

              return (
                <div
                  key={dayStr}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: 8,
                    background: dayLeaves.length > 0 ? '#eff6ff' : isWeekend ? '#f1f5f9' : '#ffffff',
                    minHeight: 74,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                      {dayNum}
                    </span>
                    {isWeekend && <span style={{ fontSize: 10, color: '#94a3b8' }}>Sun</span>}
                  </div>

                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayLeaves.map((l) => (
                      <div
                        key={l.id}
                        title={`${l.employee_name || 'Me'} - ${l.leave_type_name} (${l.reason || ''})`}
                        style={{
                          background: '#bfdbfe',
                          color: '#1e40af',
                          borderRadius: 4,
                          padding: '2px 4px',
                          fontSize: 10,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        🌴 {l.employee_name || 'Me'} ({l.leave_type_name?.slice(0, 4) || 'LV'})
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          APPLY FOR LEAVE MODAL
          ========================================================= */}
      {applyModalOpen && (
        <Modal
          title="Apply for Leave"
          onClose={() => setApplyModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setApplyModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={applying} onClick={submitApply}>
                Submit Leave Application
              </Button>
            </>
          }
        >
          {applyError && (
            <div style={{ marginBottom: 14 }}>
              <Alert type="error">{applyError}</Alert>
            </div>
          )}

          <form onSubmit={submitApply}>
            <div className="company-form-grid">
              <div className="field">
                <label className="field-label">Leave Type</label>
                <select
                  className="field-input"
                  value={applyForm.leave_type}
                  onChange={(e) => setApplyForm({ ...applyForm, leave_type: e.target.value })}
                  required
                >
                  <option value="">Select leave policy...</option>
                  {activeLeaveTypes.map((type) => {
                    const bal = balances[type.id]?.balance ?? type.max_days_per_year
                    return (
                      <option key={type.id} value={type.id}>
                        {type.name} &mdash; {type.paid ? `Paid (${bal} days left)` : 'Unpaid'}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="field">
                <label className="field-label">From Date</label>
                <input
                  type="date"
                  className="field-input"
                  value={applyForm.from_date}
                  onChange={(e) => setApplyForm({ ...applyForm, from_date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">To Date</label>
                <input
                  type="date"
                  className="field-input"
                  value={applyForm.to_date}
                  onChange={(e) => setApplyForm({ ...applyForm, to_date: e.target.value })}
                  required
                />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <Input
                  label="Reason for Leave"
                  placeholder="Provide reason or medical justification..."
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  required
                />
              </div>

              <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="is_half_day_modal"
                  checked={applyForm.is_half_day}
                  onChange={(e) => setApplyForm({ ...applyForm, is_half_day: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="is_half_day_modal" style={{ fontSize: 13, color: '#173b59', cursor: 'pointer', fontWeight: 600 }}>
                  Half Day Application (Counts as 0.5 working day)
                </label>
              </div>
            </div>

            {applyForm.from_date && applyForm.to_date && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  background: '#eff6ff',
                  borderRadius: 8,
                  border: '1px solid #bfdbfe',
                  fontSize: 12,
                  color: '#1d4ed8',
                  fontWeight: 600,
                }}
              >
                ℹ️ Net Working Days: <strong>{requestedDays} day(s)</strong> (Sundays &amp; official holidays automatically deducted).
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* =========================================================
          LEAVE REQUEST DETAIL VIEW MODAL
          ========================================================= */}
      {detailModalRequest && (
        <Modal
          title={`Leave Request Details (#${detailModalRequest.id})`}
          onClose={() => setDetailModalRequest(null)}
          footer={
            <>
              {canApprove && detailModalRequest.status === 'PENDING' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      decide(detailModalRequest, 'REJECTED')
                      setDetailModalRequest(null)
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      decide(detailModalRequest, 'APPROVED')
                      setDetailModalRequest(null)
                    }}
                  >
                    Approve Leave
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => setDetailModalRequest(null)}>
                Close
              </Button>
            </>
          }
        >
          <div className="hr-detail-grid">
            <div className="hr-detail-field">
              <span className="hr-detail-label">Employee</span>
              <strong className="hr-detail-val">{detailModalRequest.employee_name || user.username}</strong>
            </div>

            <div className="hr-detail-field">
              <span className="hr-detail-label">Employee Code</span>
              <span className="hr-detail-val">{detailModalRequest.employee_code || `EMP-${detailModalRequest.user}`}</span>
            </div>

            <div className="hr-detail-field">
              <span className="hr-detail-label">Leave Policy</span>
              <span className="hr-detail-val">{detailModalRequest.leave_type_name || 'Standard'}</span>
            </div>

            <div className="hr-detail-field">
              <span className="hr-detail-label">Current Status</span>
              <span className={`hr-badge ${String(detailModalRequest.status || '').toLowerCase()}`}>
                {detailModalRequest.status}
              </span>
            </div>

            <div className="hr-detail-field">
              <span className="hr-detail-label">Date Range</span>
              <span className="hr-detail-val">{detailModalRequest.from_date} to {detailModalRequest.to_date}</span>
            </div>

            <div className="hr-detail-field">
              <span className="hr-detail-label">Working Days</span>
              <strong className="hr-detail-val">{detailModalRequest.days} day(s)</strong>
            </div>

            <div className="hr-detail-field" style={{ gridColumn: 'span 2' }}>
              <span className="hr-detail-label">Reason / Medical Notes</span>
              <span className="hr-detail-val" style={{ background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                {detailModalRequest.reason || 'None provided'}
              </span>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================
          ADD LEAVE TYPE MODAL
          ========================================================= */}
      {typeModalOpen && (
        <Modal
          title="Configure Leave Type Policy"
          onClose={() => setTypeModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTypeModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={savingType} onClick={saveType}>
                Add Leave Type
              </Button>
            </>
          }
        >
          {typeError && <Alert type="error">{typeError}</Alert>}

          <form onSubmit={saveType}>
            <div className="company-form-grid">
              <Input
                label="Leave Name"
                placeholder="e.g. Casual Leave, Maternity Leave"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                required
              />

              <Input
                label="Code"
                placeholder="e.g. CL, SL, EL"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                required
              />

              <Input
                label="Max Days / Year Quota"
                type="number"
                min="0"
                value={typeForm.max_days_per_year}
                onChange={(e) => setTypeForm({ ...typeForm, max_days_per_year: e.target.value })}
              />

              <div className="field">
                <label className="field-label">Company Policy</label>
                <select
                  className="field-input"
                  value={typeForm.company}
                  onChange={(e) => setTypeForm({ ...typeForm, company: e.target.value })}
                >
                  <option value="">Both Companies (Group)</option>
                  {scopedCompanies.map((cId) => (
                    <option key={cId} value={cId}>Company #{cId}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2', display: 'flex', gap: 24, marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#173b59' }}>
                  <input
                    type="checkbox"
                    checked={typeForm.paid}
                    onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span>Paid Leave</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#173b59' }}>
                  <input
                    type="checkbox"
                    checked={typeForm.carry_forward}
                    onChange={(e) => setTypeForm({ ...typeForm, carry_forward: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span>Carry Forward Allowed</span>
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}