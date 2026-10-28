import { useEffect, useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import useAuth from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errors'
import { selectActiveCompanyId } from '../../utils/companySelectors'
import PageHeader from '../../components/PageHeader'
import { Sparkline, DonutChart, AreaTrendChart, BarChart } from '../dashboard/charts'

import { hrService } from './hrService'
import { allowedCompanyIds, canViewHrReports } from './permissions'

import '../dashboard/Dashboard.css'
import './Hrms.css'

export default function HrDashboard() {
  const { user } = useAuth()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const erpState = useSelector((state) => state.erp || {})

  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const scopedCompanies = allowedCompanyIds(user)
  const canSeeApprovals = canViewHrReports(user)

  const role = String(user?.profile?.role || user?.role || '').toUpperCase()
  const isAdminOrHr =
    Boolean(user?.is_superuser) ||
    role === 'SUPER_ADMIN' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'MANAGEMENT'

  const activeCompId = Number(activeCompanyId) || 1
  const isCompanyB = activeCompId === 2
  const companyName = isCompanyB ? 'Tej Biocare' : 'CMHP Pharma'

  useEffect(() => {
    setLoading(true)
    setError('')
    hrService
      .getDashboardSummary(scopedCompanies)
      .then((response) => {
        setSummary(response?.data || response)
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [activeCompanyId, isAdminOrHr])

  const name = user?.first_name || user?.username || 'Admin'

  // Company-scoped data for charts & KPIs
  const companyUsers = useMemo(() => {
    return (erpState.users || []).filter(
      (u) =>
        Number(u.primary_company) === activeCompId ||
        (Array.isArray(u.companies) && u.companies.map(Number).includes(activeCompId))
    )
  }, [erpState.users, activeCompId])

  const companyAttendance = useMemo(() => {
    const empIds = new Set(companyUsers.map((e) => Number(e.id)))
    return (erpState.attendance || []).filter((a) => empIds.has(Number(a.user)))
  }, [erpState.attendance, companyUsers])

  const companyLeaves = useMemo(() => {
    const empIds = new Set(companyUsers.map((e) => Number(e.id)))
    return (erpState.leaveRequests || []).filter(
      (l) => empIds.has(Number(l.user)) || Number(l.company) === activeCompId
    )
  }, [erpState.leaveRequests, companyUsers, activeCompId])

  const companyHolidays = useMemo(() => {
    return (erpState.holidays || []).filter(
      (h) => !h.company || Number(h.company) === activeCompId
    )
  }, [erpState.holidays, activeCompId])

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalEmp = companyUsers.filter((u) => u.is_active !== false).length

    // Today's attendance
    const todayRecords = companyAttendance.filter((a) => a.date === todayStr)
    const presentCount = todayRecords.filter((a) =>
      ['PRESENT', 'LATE', 'HALF_DAY', 'WFH'].includes(a.status)
    ).length
    const absentCount = todayRecords.filter((a) => a.status === 'ABSENT').length

    // On leave today
    const onLeaveCount = companyLeaves.filter(
      (l) => l.status === 'APPROVED' && l.from_date <= todayStr && l.to_date >= todayStr
    ).length

    // New joiners this month
    const currentMonthPrefix = todayStr.slice(0, 7)
    const newJoiners = companyUsers.filter(
      (u) => u.joining_date && u.joining_date.startsWith(currentMonthPrefix)
    ).length

    // Pending leave requests
    const pendingLeaves = companyLeaves.filter((l) => l.status === 'PENDING').length

    return {
      totalEmployees: totalEmp,
      presentToday: presentCount,
      onLeaveToday: onLeaveCount,
      absentToday: absentCount,
      newJoiners,
      pendingLeaveRequests: pendingLeaves,
    }
  }, [companyUsers, companyAttendance, companyLeaves, todayStr])

  // Chart 1: Attendance Trend (Last 7 Days)
  const attendanceTrendData = useMemo(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().slice(0, 10)
      const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
      const count = companyAttendance.filter(
        (a) => a.date === ds && ['PRESENT', 'LATE', 'HALF_DAY', 'WFH'].includes(a.status)
      ).length
      result.push({ label: dayLabel, value: Math.max(count, 0) })
    }
    return result
  }, [companyAttendance])

  // Chart 2: Department-wise Headcount
  const departmentChartData = useMemo(() => {
    const deptMap = {}
    ;(erpState.departments || []).forEach((d) => {
      deptMap[d.id] = { name: d.name, count: 0 }
    })
    companyUsers.forEach((u) => {
      const deptId = u.department?.id || u.department
      if (deptId && deptMap[deptId]) {
        deptMap[deptId].count++
      }
    })
    return Object.values(deptMap)
      .filter((d) => d.count > 0)
      .map((d, i) => ({
        label: d.name,
        value: d.count,
        color: ['#0284c7', '#0d9488', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'][i % 6],
      }))
  }, [companyUsers, erpState.departments])

  // Chart 3: Leave Distribution by Type
  const leaveDistributionData = useMemo(() => {
    const typeCounts = {
      CASUAL: { label: 'Casual', value: 0, color: '#0284c7' },
      SICK: { label: 'Medical/Sick', value: 0, color: '#f59e0b' },
      EARNED: { label: 'Earned/Paid', value: 0, color: '#10b981' },
      MATERNITY: { label: 'Maternity/Other', value: 0, color: '#8b5cf6' },
    }
    companyLeaves.forEach((l) => {
      const t = String(l.leave_type || 'CASUAL').toUpperCase()
      if (typeCounts[t]) {
        typeCounts[t].value++
      } else {
        typeCounts.CASUAL.value++
      }
    })
    return Object.values(typeCounts).filter((d) => d.value > 0)
  }, [companyLeaves])

  // Side Widget 1: Upcoming Holidays (next 5)
  const upcomingHolidays = useMemo(() => {
    return companyHolidays
      .filter((h) => h.date >= todayStr)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5)
  }, [companyHolidays, todayStr])

  // Side Widget 2: Birthdays & Work Anniversaries
  const celebrations = useMemo(() => {
    const currentMonthNum = new Date().getMonth() + 1
    const list = []
    companyUsers.forEach((u) => {
      if (u.dob) {
        const m = new Date(u.dob).getMonth() + 1
        if (m === currentMonthNum) {
          list.push({
            type: 'BIRTHDAY',
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
            date: u.dob.slice(5),
            avatar: '🎂',
          })
        }
      }
      if (u.joining_date) {
        const m = new Date(u.joining_date).getMonth() + 1
        const years = new Date().getFullYear() - new Date(u.joining_date).getFullYear()
        if (m === currentMonthNum && years > 0) {
          list.push({
            type: 'ANNIVERSARY',
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
            date: `${years} yr${years > 1 ? 's' : ''}`,
            avatar: '🎉',
          })
        }
      }
    })
    return list.slice(0, 5)
  }, [companyUsers])

  // Side Widget 3: Pending Approvals with quick action
  const pendingApprovalsList = useMemo(() => {
    return companyLeaves
      .filter((l) => l.status === 'PENDING')
      .slice(0, 4)
  }, [companyLeaves])

  // Quick Action Handler for Leave
  const handleQuickDecision = async (leaveId, decision) => {
    try {
      await hrService.decideLeave(leaveId, decision)
      const res = await hrService.getDashboardSummary(scopedCompanies)
      setSummary(res?.data || res)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace' },
          { label: companyName },
          { label: 'HR Management' },
        ]}
        title="Human Resources Command Center"
        subtitle={`Workforce headcount, attendance monitoring, leave distribution and statutory payroll for ${companyName}.`}
        statusPill={{ label: `${companyName} Scope`, variant: 'info' }}
        primaryAction={{
          label: '+ Add Employee',
          onClick: () => {
            window.location.hash = '#/hrms/employees'
          },
        }}
        secondaryActions={[
          {
            label: 'Apply Leave',
            onClick: () => {
              window.location.hash = '#/hrms/leave'
            },
          },
        ]}
      />

      {error && (
        <div className="hr-card" style={{ borderLeft: '4px solid #ef4444', color: '#991b1b', background: '#fef2f2' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="hr-card">
          <div className="hr-skeleton-loader">
            <div className="hr-skeleton-row" style={{ width: '40%' }} />
            <div className="hr-skeleton-row" style={{ width: '80%' }} />
            <div className="hr-skeleton-row" style={{ width: '60%' }} />
          </div>
        </div>
      ) : (
        <>
          {/* =========================================================
              1. KPI ROW (6 CORE HR METRICS)
              ========================================================= */}
          <section className="hr-kpis-grid">
            <Link to="/hrms/employees" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#eff6ff', color: '#0284c7' }}>
                  👥
                </span>
                <span className="hr-kpi-badge info">Active</span>
              </div>
              <div className="hr-kpi-val">{kpis.totalEmployees}</div>
              <div className="hr-kpi-title">Total Employees</div>
              <div className="hr-kpi-footer">
                <span>Company headcount</span>
                <span style={{ color: '#0284c7', fontWeight: 600 }}>Directory →</span>
              </div>
            </Link>

            <Link to="/hrms/attendance" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  ✓
                </span>
                <span className="hr-kpi-badge success">Today</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#16a34a' }}>
                {kpis.presentToday}
              </div>
              <div className="hr-kpi-title">Present Today</div>
              <div className="hr-kpi-footer">
                <span>In-office &amp; WFH</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>Roster →</span>
              </div>
            </Link>

            <Link to="/hrms/leave" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
                  🌴
                </span>
                <span className="hr-kpi-badge warning">Today</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#ca8a04' }}>
                {kpis.onLeaveToday}
              </div>
              <div className="hr-kpi-title">On Leave Today</div>
              <div className="hr-kpi-footer">
                <span>Approved requests</span>
                <span style={{ color: '#ca8a04', fontWeight: 600 }}>Calendar →</span>
              </div>
            </Link>

            <Link to="/hrms/attendance" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                  ⚠️
                </span>
                <span className="hr-kpi-badge danger">Action</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#dc2626' }}>
                {kpis.absentToday}
              </div>
              <div className="hr-kpi-title">Absent Today</div>
              <div className="hr-kpi-footer">
                <span>Unaccounted / Unpunched</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Review →</span>
              </div>
            </Link>

            <Link to="/hrms/employees" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  ✨
                </span>
                <span className="hr-kpi-badge" style={{ background: '#f3e8ff', color: '#6b21a8' }}>
                  This Month
                </span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#7c3aed' }}>
                {kpis.newJoiners}
              </div>
              <div className="hr-kpi-title">New Joiners</div>
              <div className="hr-kpi-footer">
                <span>Onboarded this cycle</span>
                <span style={{ color: '#7c3aed', fontWeight: 600 }}>Profiles →</span>
              </div>
            </Link>

            <Link to="/hrms/leave" className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
                  📬
                </span>
                <span className="hr-kpi-badge" style={{ background: '#ffedd5', color: '#c2410c' }}>
                  Pending
                </span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#ea580c' }}>
                {kpis.pendingLeaveRequests}
              </div>
              <div className="hr-kpi-title">Pending Leave Requests</div>
              <div className="hr-kpi-footer">
                <span>Awaiting manager approval</span>
                <span style={{ color: '#ea580c', fontWeight: 600 }}>Approve →</span>
              </div>
            </Link>
          </section>

          {/* =========================================================
              2. CHARTS SECTION + SIDE WIDGETS (Balanced Grid)
              ========================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: 20 }}>
            {/* Left Column: Analytics Charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Chart 1: Attendance Trend */}
              <div className="hr-card" style={{ margin: 0 }}>
                <div className="hr-card-header">
                  <div>
                    <h3 className="hr-card-title">Attendance Trend (Last 7 Days)</h3>
                    <p className="hr-card-sub">Daily verified employee presence across shifts</p>
                  </div>
                  <Link to="/hrms/attendance" style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}>
                    View Full Attendance →
                  </Link>
                </div>
                <AreaTrendChart data={attendanceTrendData} color="#0284c7" height={210} />
              </div>

              {/* Two Column Grid for Donut & Department Headcount */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {/* Department Headcount */}
                <div className="hr-card" style={{ margin: 0 }}>
                  <div className="hr-card-header">
                    <div>
                      <h3 className="hr-card-title">Department Headcount</h3>
                      <p className="hr-card-sub">Staff allocation by department</p>
                    </div>
                  </div>
                  {departmentChartData.length > 0 ? (
                    <BarChart data={departmentChartData} unit=" staff" />
                  ) : (
                    <div className="hr-empty-state" style={{ padding: '24px 0' }}>
                      <p>No department assignments found.</p>
                    </div>
                  )}
                </div>

                {/* Leave Distribution */}
                <div className="hr-card" style={{ margin: 0 }}>
                  <div className="hr-card-header">
                    <div>
                      <h3 className="hr-card-title">Leave Distribution</h3>
                      <p className="hr-card-sub">Requests segmented by leave category</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                    <DonutChart
                      data={leaveDistributionData}
                      centerValue={String(companyLeaves.length)}
                      centerLabel="Total Requests"
                    />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    {leaveDistributionData.map((d) => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                        <span style={{ color: '#64748b' }}>{d.label}:</span>
                        <strong>{d.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Side Widgets (Upcoming Holidays, Approvals, Birthdays, Activity) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Widget 1: Pending Approvals with Quick Actions */}
              <div className="hr-card" style={{ margin: 0 }}>
                <div className="hr-card-header">
                  <div>
                    <h3 className="hr-card-title">Pending Approvals</h3>
                    <p className="hr-card-sub">Time-off requests needing review</p>
                  </div>
                  <Link to="/hrms/leave" style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}>
                    All Requests ({kpis.pendingLeaveRequests}) →
                  </Link>
                </div>

                {pendingApprovalsList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pendingApprovalsList.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {req.user_name || `Employee #${req.user}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {req.leave_type} &middot; {req.from_date} to {req.to_date} ({req.days}d)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(req.id, 'APPROVED')}
                            style={{
                              padding: '5px 10px',
                              background: '#dcfce7',
                              color: '#15803d',
                              border: '1px solid #bbf7d0',
                              borderRadius: '6px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(req.id, 'REJECTED')}
                            style={{
                              padding: '5px 10px',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hr-empty-state" style={{ padding: '24px 0' }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>✓</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>All Caught Up</div>
                    <p style={{ fontSize: 12, color: '#94a3b8' }}>No pending leave approvals waiting</p>
                  </div>
                )}
              </div>

              {/* Widget 2: Upcoming Holidays */}
              <div className="hr-card" style={{ margin: 0 }}>
                <div className="hr-card-header">
                  <div>
                    <h3 className="hr-card-title">Upcoming Holidays</h3>
                    <p className="hr-card-sub">Next statutory &amp; festival breaks</p>
                  </div>
                  <Link to="/hrms/holidays" style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}>
                    View Calendar →
                  </Link>
                </div>

                {upcomingHolidays.length > 0 ? (
                  <ul className="activity-list">
                    {upcomingHolidays.map((holiday) => (
                      <li key={holiday.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="activity-dot activity-purple" />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{holiday.name}</div>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{holiday.type || 'Official'}</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '3px 8px', borderRadius: '6px' }}>
                          {holiday.date}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="hr-empty-state" style={{ padding: '20px 0' }}>
                    <p>No upcoming holidays in the next 30 days.</p>
                  </div>
                )}
              </div>

              {/* Widget 3: Birthdays & Anniversaries */}
              <div className="hr-card" style={{ margin: 0 }}>
                <div className="hr-card-header">
                  <div>
                    <h3 className="hr-card-title">Celebrations This Month</h3>
                    <p className="hr-card-sub">Team birthdays &amp; work anniversaries</p>
                  </div>
                </div>

                {celebrations.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {celebrations.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 12px',
                          background: item.type === 'BIRTHDAY' ? '#fdf4ff' : '#f0fdf4',
                          borderRadius: '8px',
                          border: `1px solid ${item.type === 'BIRTHDAY' ? '#fae8ff' : '#dcfce7'}`,
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{item.avatar}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {item.type === 'BIRTHDAY' ? 'Birthday' : 'Work Milestone'}: {item.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hr-empty-state" style={{ padding: '18px 0' }}>
                    <p style={{ fontSize: 12 }}>No staff birthdays or milestones this month.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}