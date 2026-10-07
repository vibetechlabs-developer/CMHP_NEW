import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { getErrorMessage } from '../../utils/errors'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canViewHrReports } from './permissions'
import {
  currentMonth,
  downloadCsv,
  formatDate,
  formatTime,
  monthRange,
  round2,
  todayStr,
} from './hrUtils'

import '../companies/Companies.css'
import './Hrms.css'


/*
 * HR REPORTS  (US-HR-11 Attendance Reports, Section 21 HRMS Reports)
 * -------------------------------------------------------------------------
 * Every report can be limited to one company or show both companies
 * (group level), depending on the viewer's company access.
 */

const REPORTS = [
  ['EMPLOYEES', 'Employee list'],
  ['DAILY', 'Daily attendance'],
  ['MONTHLY', 'Monthly attendance summary'],
  ['LEAVE', 'Leave summary'],
  ['DEPARTMENT', 'Department-wise headcount'],
  ['DESIGNATION', 'Designation-wise headcount'],
]

const REPORT_HINT = {
  EMPLOYEES: 'Every employee with company, department, designation and status.',
  DAILY: 'Who was present, absent, late or on leave on a chosen day.',
  MONTHLY:
    'Month totals per employee: present, late, early exit, absence, leave and working hours.',
  LEAVE:
    'Leave requests that start inside the chosen period, summed per employee.',
  DEPARTMENT: 'Active employees per department, split by company.',
  DESIGNATION: 'Active employees per designation, split by company.',
}

const STATUS_LABEL = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  LATE: 'Late',
  EARLY_EXIT: 'Early exit',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
  WFH: 'Work from home',
  NOT_MARKED: 'Not marked',
}

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')


export default function HrReports() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canView = canViewHrReports(user)

  const year = new Date().getFullYear()

  const [report, setReport] = useState('EMPLOYEES')
  const [companyFilter, setCompanyFilter] = useState('ALL')

  const [date, setDate] = useState(todayStr())
  const [month, setMonth] = useState(currentMonth())
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(`${year}-12-31`)

  const [employees, setEmployees] = useState([])
  const [companies, setCompanies] = useState([])

  const [dailyRows, setDailyRows] = useState([])
  const [monthAttendance, setMonthAttendance] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])

  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')


  // base data (employees + companies)
  useEffect(() => {
    let cancelled = false

    Promise.all([
      hrService.getEmployees(scopedCompanies),
      companyService.getCompanies(),
    ])
      .then(([employeesResponse, companiesResponse]) => {
        if (!cancelled) {
          setEmployees(employeesResponse.data)
          setCompanies(companiesResponse.data.filter((c) => c.is_active))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // data that depends on the chosen report + period
  useEffect(() => {
    let request = null

    if (report === 'DAILY' && date) {
      request = hrService
        .getAttendanceForDate(date, scopedCompanies)
        .then((response) => setDailyRows(response.data))
    }

    if (report === 'MONTHLY' && month) {
      const range = monthRange(month)

      request = hrService
        .getAttendanceRange(range.from, range.to, scopedCompanies)
        .then((response) => setMonthAttendance(response.data))
    }

    if (report === 'LEAVE') {
      request = hrService
        .getLeaveRequests(scopedCompanies)
        .then((response) => setLeaveRequests(response.data))
    }

    if (!request) {
      return undefined
    }

    let cancelled = false

    setDataLoading(true)
    setError('')

    request
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDataLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, date, month])


  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies

  const shownCompanies =
    companyFilter === 'ALL'
      ? companyOptions
      : companyOptions.filter(
          (c) => Number(c.id) === Number(companyFilter)
        )

  const matches = (companyId) =>
    companyFilter === 'ALL' ||
    Number(companyId) === Number(companyFilter)

  const companyName = (id) =>
    companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'


  // ------------------------------------------------------------------
  // BUILD THE SELECTED REPORT  ->  { columns, rows }
  // ------------------------------------------------------------------

  const view = useMemo(() => {
    const activeEmployees = employees.filter(
      (e) => e.is_active && matches(e.primary_company)
    )

    // ---------------- EMPLOYEE LIST ----------------
    if (report === 'EMPLOYEES') {
      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'department', label: 'Department' },
          { key: 'designation', label: 'Designation' },
          { key: 'joining', label: 'Joining date' },
          { key: 'status', label: 'Status' },
        ],
        rows: employees
          .filter((e) => matches(e.primary_company))
          .map((e) => ({
            id: e.id,
            code: e.employee_id || '\u2014',
            name: e.display_name,
            company: e.company?.name || '\u2014',
            department: e.department?.name || '\u2014',
            designation: e.designation || '\u2014',
            joining: formatDate(e.joining_date),
            status: e.is_active
              ? titleCase(e.employment_status || 'ACTIVE')
              : 'Inactive',
          })),
      }
    }

    // ---------------- DAILY ATTENDANCE ----------------
    if (report === 'DAILY') {
      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'department', label: 'Department' },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              <span className={`attendance-status attendance-${row.status}`}>
                {STATUS_LABEL[row.status] || row.status}
              </span>
            ),
            csv: (row) => STATUS_LABEL[row.status] || row.status,
          },
          { key: 'checkIn', label: 'Check-in' },
          { key: 'checkOut', label: 'Check-out' },
          { key: 'hours', label: 'Hours', num: true },
        ],
        rows: dailyRows
          .filter((row) => matches(row.employee.primary_company))
          .map(({ employee, attendance }) => ({
            id: employee.id,
            code: employee.employee_id || '\u2014',
            name: employee.display_name,
            company: employee.company?.name || '\u2014',
            department: employee.department?.name || '\u2014',
            status: attendance?.status || 'NOT_MARKED',
            checkIn: formatTime(attendance?.check_in),
            checkOut: formatTime(attendance?.check_out),
            hours: attendance?.working_hours ?? '\u2014',
          })),
      }
    }

    // ---------------- MONTHLY ATTENDANCE ----------------
    if (report === 'MONTHLY') {
      const byUser = new Map()

      monthAttendance.forEach((record) => {
        const key = Number(record.user)
        const list = byUser.get(key) || []
        list.push(record)
        byUser.set(key, list)
      })

      const countOf = (records, status) =>
        records.filter((r) => r.status === status).length

      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'department', label: 'Department' },
          { key: 'present', label: 'Present', num: true },
          { key: 'late', label: 'Late', num: true },
          { key: 'wfh', label: 'WFH', num: true },
          { key: 'half', label: 'Half day', num: true },
          { key: 'early', label: 'Early exit', num: true },
          { key: 'absent', label: 'Absent', num: true },
          { key: 'leave', label: 'Leave', num: true },
          { key: 'hours', label: 'Working hours', num: true },
        ],
        rows: activeEmployees.map((e) => {
          const records = byUser.get(Number(e.id)) || []

          return {
            id: e.id,
            code: e.employee_id || '\u2014',
            name: e.display_name,
            company: e.company?.name || '\u2014',
            department: e.department?.name || '\u2014',
            present: countOf(records, 'PRESENT'),
            late: countOf(records, 'LATE'),
            wfh: countOf(records, 'WFH'),
            half: countOf(records, 'HALF_DAY'),
            early: countOf(records, 'EARLY_EXIT'),
            absent: countOf(records, 'ABSENT'),
            leave: countOf(records, 'LEAVE'),
            hours: round2(
              records.reduce(
                (sum, r) => sum + (Number(r.working_hours) || 0),
                0
              )
            ),
          }
        }),
      }
    }

    // ---------------- LEAVE SUMMARY ----------------
    if (report === 'LEAVE') {
      const byUser = new Map()

      leaveRequests
        .filter(
          (r) =>
            matches(r.company) &&
            (!from || r.from_date >= from) &&
            (!to || r.from_date <= to)
        )
        .forEach((r) => {
          const key = Number(r.user)

          const entry = byUser.get(key) || {
            id: key,
            code: r.employee_code || '\u2014',
            name: r.employee_name,
            company: companyName(r.company),
            requests: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
            types: {},
          }

          entry.requests += 1

          if (r.status === 'APPROVED') {
            entry.approved += Number(r.days) || 0
            entry.types[r.leave_type_name] =
              (entry.types[r.leave_type_name] || 0) + (Number(r.days) || 0)
          }

          if (r.status === 'PENDING') {
            entry.pending += Number(r.days) || 0
          }

          if (r.status === 'REJECTED') {
            entry.rejected += Number(r.days) || 0
          }

          byUser.set(key, entry)
        })

      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'requests', label: 'Requests', num: true },
          { key: 'approved', label: 'Approved days', num: true },
          { key: 'pending', label: 'Pending days', num: true },
          { key: 'rejected', label: 'Rejected days', num: true },
          { key: 'typeText', label: 'Approved by type' },
        ],
        rows: Array.from(byUser.values()).map((entry) => ({
          ...entry,
          typeText:
            Object.entries(entry.types)
              .map(([name, days]) => `${name}: ${days}`)
              .join(', ') || '\u2014',
        })),
      }
    }

    // ------------- DEPARTMENT / DESIGNATION HEADCOUNT -------------
    const groupOf =
      report === 'DEPARTMENT'
        ? (e) => e.department?.name || 'No department'
        : (e) => (e.designation || '').trim() || 'Not set'

    const groups = new Map()

    // e.g. the seeded System Administrator has no company of its own
    const hasUnassigned = activeEmployees.some((e) => !e.primary_company)

    activeEmployees.forEach((e) => {
      const key = groupOf(e)
      const entry = groups.get(key) || { id: key, group: key, total: 0 }
      const companyKey = `c${e.primary_company || 0}`

      entry[companyKey] = (entry[companyKey] || 0) + 1
      entry.total += 1

      groups.set(key, entry)
    })

    const countColumns = [
      ...shownCompanies.map((company) => ({
        key: `c${company.id}`,
        label: company.name,
      })),
      ...(hasUnassigned ? [{ key: 'c0', label: 'No company' }] : []),
    ]

    const rows = Array.from(groups.values()).sort(
      (a, b) => b.total - a.total || a.group.localeCompare(b.group)
    )

    const columns = [
      {
        key: 'group',
        label: report === 'DEPARTMENT' ? 'Department' : 'Designation',
      },
      ...countColumns.map((column) => ({
        ...column,
        num: true,
        render: (row) => row[column.key] || 0,
        csv: (row) => row[column.key] || 0,
      })),
      { key: 'total', label: 'Total', num: true },
    ]

    if (rows.length > 0) {
      const totalRow = { id: '__total', group: 'Total', total: 0, isTotal: true }

      rows.forEach((row) => {
        totalRow.total += row.total

        countColumns.forEach(({ key }) => {
          totalRow[key] = (totalRow[key] || 0) + (row[key] || 0)
        })
      })

      rows.push(totalRow)
    }

    return { columns, rows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    report,
    employees,
    companies,
    companyFilter,
    dailyRows,
    monthAttendance,
    leaveRequests,
    from,
    to,
  ])


  // ------------------------------------------------------------------
  // KPI CARDS (group level)
  // ------------------------------------------------------------------

  const activeInView = employees.filter(
    (e) => e.is_active && matches(e.primary_company)
  )

  const dailyCount = (statuses) =>
    view.rows.filter((row) => statuses.includes(row.status)).length

  const withoutCompany = activeInView.filter(
    (e) => !e.primary_company
  ).length

  const cards = [
    { label: 'Active employees', value: activeInView.length },

    ...shownCompanies.map((company) => ({
      label: `${company.name} employees`,
      value: activeInView.filter(
        (e) => Number(e.primary_company) === Number(company.id)
      ).length,
    })),
  ]

  if (withoutCompany > 0) {
    cards.push({ label: 'No company assigned', value: withoutCompany })
  }

  if (report === 'DAILY') {
    cards.push(
      {
        label: 'Present',
        value: dailyCount(['PRESENT', 'LATE', 'WFH', 'EARLY_EXIT', 'HALF_DAY']),
      },
      { label: 'Absent', value: dailyCount(['ABSENT']) },
      { label: 'On leave', value: dailyCount(['LEAVE']) },
      { label: 'Not marked', value: dailyCount(['NOT_MARKED']) }
    )
  }


  const exportReport = () => {
    const suffix =
      report === 'DAILY'
        ? date
        : report === 'MONTHLY'
          ? month
          : report === 'LEAVE'
            ? `${from}_to_${to}`
            : todayStr()

    downloadCsv(
      `hr-${report.toLowerCase()}-${suffix}.csv`,
      view.columns,
      view.rows
    )
  }


  if (!canView) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>HR Reports</h1>
          <p>Your current role does not have access to HR reports.</p>
        </section>
      </div>
    )
  }


  const busy = loading || dataLoading
  const reportTitle = REPORTS.find(([value]) => value === report)?.[1]


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
          <h1>HR Reports</h1>
          <p>
            Company-wise HR reports with a group-level view for authorized
            management. Export any report to CSV.
          </p>
        </div>
      </div>

      <div className="hr-kpis">
        {cards.map((card) => (
          <div className="hr-kpi-card" key={card.label}>
            <div className="hr-kpi-value">{card.value}</div>
            <div className="hr-kpi-label">{card.label}</div>
          </div>
        ))}
      </div>

      <section className="company-panel">

        <div className="company-toolbar">
          <div>
            <h2>{reportTitle}</h2>
            <p>{REPORT_HINT[report]}</p>
          </div>

          <Button
            variant="secondary"
            onClick={exportReport}
            disabled={busy || view.rows.length === 0}
          >
            Download CSV
          </Button>
        </div>

        <div className="hr-filters">
          <select
            className="company-select"
            value={report}
            onChange={(event) => setReport(event.target.value)}
          >
            {REPORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="company-select"
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="ALL">
              {companyOptions.length > 1 ? 'Both companies' : 'All companies'}
            </option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          {report === 'DAILY' && (
            <input
              className="company-select"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}

          {report === 'MONTHLY' && (
            <input
              className="company-select"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          )}

          {report === 'LEAVE' && (
            <>
              <input
                className="company-select"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                aria-label="From date"
              />
              <input
                className="company-select"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-label="To date"
              />
            </>
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                {view.columns.map((column) => (
                  <th key={column.key} className={column.num ? 'hr-num' : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {busy && (
                <tr>
                  <td colSpan={view.columns.length} className="company-empty">
                    Loading report...
                  </td>
                </tr>
              )}

              {!busy &&
                view.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.isTotal ? 'hr-total-row' : undefined}
                  >
                    {view.columns.map((column) => (
                      <td
                        key={column.key}
                        className={column.num ? 'hr-num' : undefined}
                      >
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}

              {!busy && view.rows.length === 0 && (
                <tr>
                  <td colSpan={view.columns.length} className="company-empty">
                    No data for this report.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}