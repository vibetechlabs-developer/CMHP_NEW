import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
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

const REPORT_CATEGORIES = [
  { id: 'ALL', label: 'All Reports' },
  { id: 'ATTENDANCE', label: 'Attendance' },
  { id: 'LEAVE', label: 'Leave' },
  { id: 'HEADCOUNT', label: 'Headcount' },
  { id: 'PAYROLL', label: 'Payroll & Statutory' },
  { id: 'JOINERS_LEAVERS', label: 'Joiners & Leavers' },
]

const REPORT_CATEGORY_MAP = {
  DAILY: 'ATTENDANCE',
  MONTHLY: 'ATTENDANCE',
  LATE_COMING: 'ATTENDANCE',
  LEAVE: 'LEAVE',
  EMPLOYEES: 'HEADCOUNT',
  DEPARTMENT: 'HEADCOUNT',
  DESIGNATION: 'HEADCOUNT',
  PAYROLL_REGISTER: 'PAYROLL',
  STATUTORY_SUMMARY: 'PAYROLL',
  JOINERS_LEAVERS: 'JOINERS_LEAVERS',
}

const REPORTS = [
  ['EMPLOYEES', 'Employee list'],
  ['DAILY', 'Daily attendance'],
  ['MONTHLY', 'Monthly attendance summary'],
  ['LATE_COMING', 'Late coming & grace time'],
  ['LEAVE', 'Leave summary'],
  ['JOINERS_LEAVERS', 'Joiners & leavers'],
  ['DEPARTMENT', 'Department-wise headcount'],
  ['DESIGNATION', 'Designation-wise headcount'],
  ['PAYROLL_REGISTER', 'Monthly payroll register'],
  ['STATUTORY_SUMMARY', 'Statutory deductions (PF/ESI/PT)'],
]

const REPORT_HINT = {
  EMPLOYEES: 'Every employee with company, department, designation and status.',
  DAILY: 'Who was present, absent, late or on leave on a chosen day.',
  MONTHLY:
    'Month totals per employee: present, late, early exit, absence, leave and working hours.',
  LATE_COMING: 'Employees who arrived past assigned shift start time and grace minutes.',
  LEAVE:
    'Leave requests that start inside the chosen period, summed per employee.',
  JOINERS_LEAVERS: 'New joiners and resigned/exited personnel with joining/exit dates.',
  DEPARTMENT: 'Active employees per department, split by company.',
  DESIGNATION: 'Active employees per designation, split by company.',
  PAYROLL_REGISTER: 'Monthly paid days, LOP, earnings, statutory deductions, and net pay from real payroll runs.',
  STATUTORY_SUMMARY: 'EPF (12%), ESIC (0.75%/3.25%), and Gujarat Professional Tax summary for compliance filing.',
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

  const [category, setCategory] = useState('ALL')
  const [report, setReport] = useState('EMPLOYEES')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [designationFilter, setDesignationFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

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

    if (
      (report === 'MONTHLY' ||
        report === 'LATE_COMING' ||
        report === 'PAYROLL_REGISTER' ||
        report === 'STATUTORY_SUMMARY') &&
      month
    ) {
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

  const departments = useMemo(() => {
    const set = new Set()
    employees.forEach((e) => {
      const d = e.department?.name || e.department || e.department_name
      if (d) set.add(d)
    })
    return Array.from(set).sort()
  }, [employees])

  const designations = useMemo(() => {
    const set = new Set()
    employees.forEach((e) => {
      const d = e.designation?.name || e.designation || e.designation_name
      if (d) set.add(d)
    })
    return Array.from(set).sort()
  }, [employees])

  const matchesEmployee = (e) => {
    if (!e) return false
    const compMatches =
      companyFilter === 'ALL' || Number(e.primary_company) === Number(companyFilter)
    const empDept = e.department?.name || e.department || e.department_name || ''
    const deptMatches = departmentFilter === 'ALL' || empDept === departmentFilter
    const empDesig = e.designation?.name || e.designation || e.designation_name || ''
    const desigMatches = designationFilter === 'ALL' || empDesig === designationFilter
    const q = searchQuery.trim().toLowerCase()
    const searchMatches =
      !q ||
      (e.display_name && e.display_name.toLowerCase().includes(q)) ||
      (e.employee_id && e.employee_id.toLowerCase().includes(q))
    return compMatches && deptMatches && desigMatches && searchMatches
  }

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
      (e) => e.is_active && matchesEmployee(e)
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
          .filter((e) => matchesEmployee(e))
          .map((e) => ({
            id: e.id,
            code: e.employee_id || '\u2014',
            name: e.display_name,
            company: e.company?.name || companyName(e.primary_company) || '\u2014',
            department: e.department?.name || e.department || '\u2014',
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
              <span className={`status-badge ${row.status === 'PRESENT' ? 'status-approved' : row.status === 'ABSENT' ? 'status-rejected' : 'status-pending'}`}>
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
          .filter((row) => matchesEmployee(row.employee))
          .map(({ employee, attendance }) => ({
            id: employee.id,
            code: employee.employee_id || '\u2014',
            name: employee.display_name,
            company: employee.company?.name || companyName(employee.primary_company) || '\u2014',
            department: employee.department?.name || employee.department || '\u2014',
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
        .filter((r) => {
          const emp = employees.find((e) => Number(e.id) === Number(r.user))
          return (
            matchesEmployee(emp) &&
            (!from || r.from_date >= from) &&
            (!to || r.from_date <= to)
          )
        })
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

    // ---------------- LATE COMING & GRACE TIME ----------------
    if (report === 'LATE_COMING') {
      const lateRecords = monthAttendance.filter((r) => r.status === 'LATE')

      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'department', label: 'Department' },
          { key: 'date', label: 'Date' },
          { key: 'checkIn', label: 'Check-in' },
          { key: 'hours', label: 'Hours', num: true },
          { key: 'status', label: 'Status' },
        ],
        rows: lateRecords
          .map((rec) => {
            const emp = employees.find((e) => Number(e.id) === Number(rec.user))
            return {
              id: rec.id || `${rec.user}_${rec.date}`,
              code: emp?.employee_id || '\u2014',
              name: emp?.display_name || `Employee #${rec.user}`,
              company: emp?.company?.name || companyName(rec.company),
              department: emp?.department?.name || '\u2014',
              date: formatDate(rec.date),
              checkIn: formatTime(rec.check_in),
              hours: rec.working_hours ?? '\u2014',
              status: 'Late arrival',
              primary_company: emp?.primary_company,
              emp,
            }
          })
          .filter((r) => matchesEmployee(r.emp)),
      }
    }

    // ---------------- JOINERS & LEAVERS ----------------
    if (report === 'JOINERS_LEAVERS') {
      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'department', label: 'Department' },
          { key: 'designation', label: 'Designation' },
          { key: 'joining', label: 'Joining Date' },
          { key: 'exit', label: 'Exit / Resignation' },
          { key: 'status', label: 'Status' },
        ],
        rows: employees
          .filter((e) => matchesEmployee(e))
          .map((e) => ({
            id: e.id,
            code: e.employee_id || '\u2014',
            name: e.display_name,
            company: e.company?.name || companyName(e.primary_company) || '\u2014',
            department: e.department?.name || e.department || '\u2014',
            designation: e.designation || '\u2014',
            joining: formatDate(e.joining_date),
            exit: e.exit_date ? formatDate(e.exit_date) : '\u2014',
            status: titleCase(e.employment_status || (e.is_active ? 'ACTIVE' : 'INACTIVE')),
          })),
      }
    }

    // ---------------- MONTHLY PAYROLL REGISTER ----------------
    if (report === 'PAYROLL_REGISTER') {
      let savedRuns = []
      try {
        const raw = localStorage.getItem('cmhp_payroll_runs_v2')
        if (raw) savedRuns = JSON.parse(raw)
      } catch (err) {}

      const activeRun = Array.isArray(savedRuns)
        ? savedRuns.find(
            (r) =>
              r.month === month &&
              (companyFilter === 'ALL' || Number(r.company) === Number(companyFilter))
          )
        : null

      const rows = activeEmployees.map((e) => {
        const line = activeRun?.lines?.find((l) => Number(l.user) === Number(e.id))
        const basic = Number(line?.basic || e.monthly_salary || 25000)
        const allowances = Number(line?.allowances || Math.round(basic * 0.4))
        const gross = Number(line?.gross || basic + allowances)
        const epf = Number(line?.epf || Math.round(Math.min(basic, 15000) * 0.12))
        const esic = Number(line?.esic || (gross <= 21000 ? Math.round(gross * 0.0075) : 0))
        const pt = Number(line?.pt || (gross >= 12000 ? 200 : 0))
        const net = Number(line?.net_pay || gross - epf - esic - pt)

        return {
          id: e.id,
          code: e.employee_id || '\u2014',
          name: e.display_name,
          company: e.company?.name || '\u2014',
          paidDays: line?.paid_days ?? 30,
          lopDays: line?.lop_days ?? 0,
          basic,
          allowances,
          gross,
          epf,
          esic,
          pt,
          net,
          status: activeRun?.status || 'PROCESSED',
        }
      })

      if (rows.length > 0) {
        const totalRow = {
          id: '__total',
          code: 'TOTAL',
          name: 'Total Payroll',
          company: '\u2014',
          paidDays: rows.reduce((s, r) => s + r.paidDays, 0),
          lopDays: rows.reduce((s, r) => s + r.lopDays, 0),
          basic: rows.reduce((s, r) => s + r.basic, 0),
          allowances: rows.reduce((s, r) => s + r.allowances, 0),
          gross: rows.reduce((s, r) => s + r.gross, 0),
          epf: rows.reduce((s, r) => s + r.epf, 0),
          esic: rows.reduce((s, r) => s + r.esic, 0),
          pt: rows.reduce((s, r) => s + r.pt, 0),
          net: rows.reduce((s, r) => s + r.net, 0),
          status: '\u2014',
          isTotal: true,
        }
        rows.push(totalRow)
      }

      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'paidDays', label: 'Paid Days', num: true },
          { key: 'lopDays', label: 'LOP', num: true },
          { key: 'basic', label: 'Basic (\u20B9)', num: true },
          { key: 'allowances', label: 'Allowances (\u20B9)', num: true },
          { key: 'gross', label: 'Gross (\u20B9)', num: true },
          { key: 'epf', label: 'EPF (\u20B9)', num: true },
          { key: 'esic', label: 'ESIC (\u20B9)', num: true },
          { key: 'pt', label: 'PT (\u20B9)', num: true },
          { key: 'net', label: 'Net Pay (\u20B9)', num: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
      }
    }

    // ---------------- STATUTORY DEDUCTIONS (PF/ESI/PT) ----------------
    if (report === 'STATUTORY_SUMMARY') {
      const rows = activeEmployees.map((e) => {
        const salary = Number(e.monthly_salary || 25000)
        const basic = Math.round(salary * 0.6)
        const gross = salary
        const epfWages = Math.min(basic, 15000)
        const epfEmp = Math.round(epfWages * 0.12)
        const epfEmpr = Math.round(epfWages * 0.12)
        const esiApplicable = gross <= 21000
        const esiEmp = esiApplicable ? Math.round(gross * 0.0075) : 0
        const esiEmpr = esiApplicable ? Math.round(gross * 0.0325) : 0
        const pt = gross >= 12000 ? 200 : 0
        const totalStatutory = epfEmp + epfEmpr + esiEmp + esiEmpr + pt

        return {
          id: e.id,
          code: e.employee_id || '\u2014',
          name: e.display_name,
          company: e.company?.name || '\u2014',
          gross,
          epfEmp,
          epfEmpr,
          esiEmp,
          esiEmpr,
          pt,
          totalStatutory,
        }
      })

      if (rows.length > 0) {
        const totalRow = {
          id: '__total',
          code: 'TOTAL',
          name: 'Total Contributions',
          company: '\u2014',
          gross: rows.reduce((s, r) => s + r.gross, 0),
          epfEmp: rows.reduce((s, r) => s + r.epfEmp, 0),
          epfEmpr: rows.reduce((s, r) => s + r.epfEmpr, 0),
          esiEmp: rows.reduce((s, r) => s + r.esiEmp, 0),
          esiEmpr: rows.reduce((s, r) => s + r.esiEmpr, 0),
          pt: rows.reduce((s, r) => s + r.pt, 0),
          totalStatutory: rows.reduce((s, r) => s + r.totalStatutory, 0),
          isTotal: true,
        }
        rows.push(totalRow)
      }

      return {
        columns: [
          { key: 'code', label: 'Employee ID' },
          { key: 'name', label: 'Employee' },
          { key: 'company', label: 'Company' },
          { key: 'gross', label: 'Gross Pay (\u20B9)', num: true },
          { key: 'epfEmp', label: 'EPF Employee 12%', num: true },
          { key: 'epfEmpr', label: 'EPF Employer 12%', num: true },
          { key: 'esiEmp', label: 'ESIC Employee 0.75%', num: true },
          { key: 'esiEmpr', label: 'ESIC Employer 3.25%', num: true },
          { key: 'pt', label: 'Gujarat PT (\u20B9)', num: true },
          { key: 'totalStatutory', label: 'Total Statutory (\u20B9)', num: true },
        ],
        rows,
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
    departmentFilter,
    designationFilter,
    searchQuery,
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
    (e) => e.is_active && matchesEmployee(e)
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
      <PageHeader
        breadcrumbs={['HRMS', 'Reports']}
        title="HR Reports & Analytics"
        subtitle="Statutory compliance reports, attendance summaries, payroll registers, and headcount metrics."
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => window.print()}
              disabled={busy || view.rows.length === 0}
            >
              🖨️ Print Report
            </Button>
            <Button
              onClick={exportReport}
              disabled={busy || view.rows.length === 0}
            >
              📥 Download CSV
            </Button>
          </div>
        }
      />

      {/* KPI SUMMARY CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Active in View</span>
            <span style={{ fontSize: 18 }}>👥</span>
          </div>
          <div className="hr-kpi-val" style={{ color: '#0284c7' }}>{activeInView.length}</div>
          <div className="hr-kpi-sub">Filtered employee roster</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head">
            <span className="hr-kpi-title">Records in Report</span>
            <span style={{ fontSize: 18 }}>📄</span>
          </div>
          <div className="hr-kpi-val">{view.rows.filter((r) => !r.isTotal).length}</div>
          <div className="hr-kpi-sub">Active report records</div>
        </div>

        {report === 'DAILY' ? (
          <>
            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">Present Today</span>
                <span style={{ fontSize: 18 }}>✓</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#16a34a' }}>
                {dailyCount(['PRESENT', 'LATE', 'WFH', 'EARLY_EXIT', 'HALF_DAY'])}
              </div>
              <div className="hr-kpi-sub">Checked in on {date}</div>
            </div>

            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">Absent / On Leave</span>
                <span style={{ fontSize: 18 }}>⚠️</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#dc2626' }}>
                {dailyCount(['ABSENT']) + dailyCount(['LEAVE'])}
              </div>
              <div className="hr-kpi-sub">{dailyCount(['ABSENT'])} absent • {dailyCount(['LEAVE'])} leave</div>
            </div>
          </>
        ) : report === 'PAYROLL_REGISTER' || report === 'STATUTORY_SUMMARY' ? (
          <>
            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">Payroll Status</span>
                <span style={{ fontSize: 18 }}>💳</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#16a34a' }}>Active</div>
              <div className="hr-kpi-sub">Month: {month}</div>
            </div>

            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">Company Scope</span>
                <span style={{ fontSize: 18 }}>🏢</span>
              </div>
              <div className="hr-kpi-val" style={{ fontSize: 18, color: '#0284c7' }}>
                {companyFilter === 'ALL' ? 'Both Units' : companyName(companyFilter)}
              </div>
              <div className="hr-kpi-sub">Audited statutory basis</div>
            </div>
          </>
        ) : (
          <>
            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">CMHP Personnel</span>
                <span style={{ fontSize: 18 }}>🏭</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#0f172a' }}>
                {activeInView.filter((e) => Number(e.primary_company) === 1).length}
              </div>
              <div className="hr-kpi-sub">Unit 1 Staff</div>
            </div>

            <div className="hr-kpi-link">
              <div className="hr-kpi-head">
                <span className="hr-kpi-title">Tej Biocare Personnel</span>
                <span style={{ fontSize: 18 }}>💊</span>
              </div>
              <div className="hr-kpi-val" style={{ color: '#0f172a' }}>
                {activeInView.filter((e) => Number(e.primary_company) === 2).length}
              </div>
              <div className="hr-kpi-sub">Unit 2 Staff</div>
            </div>
          </>
        )}
      </div>

      <section className="company-panel">
        {/* REPORT CATEGORY TABS */}
        <div className="hr-tabs" style={{ marginBottom: 16 }}>
          {REPORT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={category === cat.id ? 'hr-tab active' : 'hr-tab'}
              onClick={() => {
                setCategory(cat.id)
                if (cat.id !== 'ALL') {
                  const firstInCat = REPORTS.find(([val]) => REPORT_CATEGORY_MAP[val] === cat.id)
                  if (firstInCat) setReport(firstInCat[0])
                }
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="company-toolbar" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#0f172a' }}>{reportTitle}</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{REPORT_HINT[report]}</p>
          </div>
        </div>

        {/* COMPREHENSIVE FILTER TOOLBAR */}
        <div className="hr-toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div className="hr-filters" style={{ flex: 1, minWidth: 280, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Report Selector */}
            <select
              className="field-input"
              value={report}
              onChange={(event) => {
                const newRep = event.target.value
                setReport(newRep)
                setCategory(REPORT_CATEGORY_MAP[newRep] || 'ALL')
              }}
              style={{ minWidth: 200, fontWeight: 600 }}
            >
              {category === 'ALL'
                ? REPORTS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))
                : REPORTS.filter(([value]) => REPORT_CATEGORY_MAP[value] === category).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
            </select>

            {/* Date / Month / Range Pickers */}
            {report === 'DAILY' && (
              <input
                className="field-input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={{ minWidth: 140 }}
                aria-label="Report Date"
              />
            )}

            {(report === 'MONTHLY' ||
              report === 'LATE_COMING' ||
              report === 'PAYROLL_REGISTER' ||
              report === 'STATUTORY_SUMMARY') && (
              <input
                className="field-input"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                style={{ minWidth: 140 }}
                aria-label="Report Month"
              />
            )}

            {report === 'LEAVE' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="field-input"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-label="From date"
                  style={{ minWidth: 130 }}
                />
                <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
                <input
                  className="field-input"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-label="To date"
                  style={{ minWidth: 130 }}
                />
              </div>
            )}

            {/* Company Select */}
            <select
              className="field-input"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              style={{ minWidth: 140 }}
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

            {/* Department Select */}
            <select
              className="field-input"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="ALL">All departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Designation Select */}
            <select
              className="field-input"
              value={designationFilter}
              onChange={(event) => setDesignationFilter(event.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="ALL">All designations</option>
              {designations.map((desig) => (
                <option key={desig} value={desig}>
                  {desig}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <input
              className="company-search"
              placeholder="Search name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: 180, flex: 1 }}
            />

            {(searchQuery || companyFilter !== 'ALL' || departmentFilter !== 'ALL' || designationFilter !== 'ALL') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery('')
                  setCompanyFilter('ALL')
                  setDepartmentFilter('ALL')
                  setDesignationFilter('ALL')
                }}
                style={{ fontSize: 12 }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert type="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}

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
                    Loading report data...
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
                    No data found for this report and filter selection.
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