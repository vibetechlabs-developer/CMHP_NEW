import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Spinner from '../../components/Spinner'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import Modal from '../inventory/components/Modal'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManagePayroll } from './permissions'
import {
  currentMonth,
  downloadCsv,
  formatDate,
  formatMoney,
  monthDates,
  monthRange,
  round2,
  todayStr,
} from './hrUtils'

import '../companies/Companies.css'
import './Hrms.css'


/*
 * PAYROLL  (US-HR-10.1 Salary Structure, US-HR-10.2 Payroll Calculation)
 * -------------------------------------------------------------------------
 * Payable salary =
 *     Salary (prorated by payable days)
 *   + Incentives + Bonus
 *   - Deductions
 *   +/- Approved adjustments
 *
 * Payable days come from Attendance + Leave + Holidays + Weekly off:
 *   present / late / WFH / early exit ........ 1 day
 *   half day ................................. 0.5 day
 *   paid leave (approved) .................... 1 day
 *   unpaid leave (approved) / absent ......... 0 day
 *   weekly off + company holiday ............. 1 day (paid)
 *   working day with no attendance mark ...... per the "unmarked days" option
 *   days still to come in the running month .. 1 day (until they pass)
 *
 * NOTE: payroll was outside the original ERP scope - it only exists here
 * because it was added in the v2.0 requirements ("if approved").
 */


const EMPTY_FORM = {
  user: '',
  effective_from: '',
  basic: '',
  allowances: '',
  incentives: '',
  bonus: '',
  other: '',
  deductions: '',
  note: '',
}

const ADJUSTMENTS_KEY = 'cmhp_payroll_adjustments_v1'

const num = (value) => Number(value) || 0

const grossOf = (s) =>
  num(s.basic) +
  num(s.allowances) +
  num(s.incentives) +
  num(s.bonus) +
  num(s.other)

const netOf = (s) => grossOf(s) - num(s.deductions)


function loadAdjustments() {
  try {
    const raw = localStorage.getItem(ADJUSTMENTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}


function weeklyOffTokens(shift) {
  return String(shift?.weekly_off || 'Sunday')
    .toLowerCase()
    .split(/[,/&]|\band\b/)
    .map((token) => token.trim().slice(0, 3))
    .filter(Boolean)
}

const WEEKDAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function isWeeklyOff(dateStr, tokens) {
  const day = new Date(`${dateStr}T00:00:00`).getDay()
  return tokens.includes(WEEKDAY_TOKENS[day])
}


function buildPayrollRow({
  structure,
  employee,
  month,
  data,
  unmarkedPaid,
  adjustment,
}) {
  const { days } = monthRange(month)
  const dates = monthDates(month)
  const today = todayStr()

  const records = new Map(
    data.attendance
      .filter((r) => Number(r.user) === Number(structure.user))
      .map((r) => [r.date, r])
  )

  const holidayDates = new Set(
    data.holidays
      .filter(
        (h) =>
          !h.company ||
          Number(h.company) === Number(structure.company)
      )
      .map((h) => h.date)
  )

  const leaves = data.leaves.filter(
    (r) =>
      Number(r.user) === Number(structure.user) &&
      r.status === 'APPROVED'
  )

  const offTokens = weeklyOffTokens(employee?.shift)

  const leaveOn = (date) =>
    leaves.find((r) => r.from_date <= date && r.to_date >= date)

  // no matching approved request (HR marked "Leave" directly) -> paid
  const leavePaid = (request) => {
    if (!request) {
      return true
    }

    const type = data.leaveTypes.find(
      (t) => Number(t.id) === Number(request.leave_type)
    )

    return type ? Boolean(type.paid) : true
  }

  const count = {
    worked: 0,
    halfDays: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    offDays: 0,
    holidayDays: 0,
    absent: 0,
    unmarked: 0,
    upcoming: 0,
  }

  dates.forEach((date) => {
    const record = records.get(date)

    if (record) {
      switch (record.status) {
        case 'PRESENT':
        case 'LATE':
        case 'WFH':
        case 'EARLY_EXIT':
          count.worked += 1
          break
        case 'HALF_DAY':
          count.halfDays += 1
          break
        case 'LEAVE':
          if (leavePaid(leaveOn(date))) {
            count.paidLeave += 1
          } else {
            count.unpaidLeave += 1
          }
          break
        case 'HOLIDAY':
          count.holidayDays += 1
          break
        case 'WEEKLY_OFF':
          count.offDays += 1
          break
        default:
          count.absent += 1
      }

      return
    }

    if (isWeeklyOff(date, offTokens)) {
      count.offDays += 1
      return
    }

    if (holidayDates.has(date)) {
      count.holidayDays += 1
      return
    }

    const leave = leaveOn(date)

    if (leave) {
      if (leavePaid(leave)) {
        count.paidLeave += 1
      } else {
        count.unpaidLeave += 1
      }
      return
    }

    if (date > today) {
      count.upcoming += 1
      return
    }

    count.unmarked += 1
  })

  const payableDays = Math.min(
    days,
    count.worked +
      count.halfDays * 0.5 +
      count.paidLeave +
      count.offDays +
      count.holidayDays +
      count.upcoming +
      (unmarkedPaid ? count.unmarked : 0)
  )

  const fixedEarnings =
    num(structure.basic) +
    num(structure.allowances) +
    num(structure.other)

  const variableEarnings =
    num(structure.incentives) + num(structure.bonus)

  const proratedFixed = round2((fixedEarnings * payableDays) / days)

  const earnings = round2(proratedFixed + variableEarnings)

  const deductions = num(structure.deductions)

  const net = Math.max(round2(earnings - deductions + adjustment), 0)

  return {
    user: structure.user,
    name: structure.employee_name,
    code: employee?.employee_id || '',
    company: structure.company,
    days,
    ...count,
    payableDays,
    unpaidDays: round2(days - payableDays),
    basic: num(structure.basic),
    allowances: num(structure.allowances),
    other: num(structure.other),
    incentives: num(structure.incentives),
    bonus: num(structure.bonus),
    earnings,
    deductions,
    adjustment,
    net,
  }
}


export default function Payroll() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManagePayroll(user)

  const [tab, setTab] = useState('structures')

  const [structures, setStructures] = useState([])
  const [employees, setEmployees] = useState([])
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [companyFilter, setCompanyFilter] = useState('ALL')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [month, setMonth] = useState(currentMonth())
  const [unmarkedPaid, setUnmarkedPaid] = useState(false)
  const [adjustments, setAdjustments] = useState(loadAdjustments)

  const [payrollData, setPayrollData] = useState({
    attendance: [],
    holidays: [],
    leaves: [],
    leaveTypes: [],
  })
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [payrollError, setPayrollError] = useState('')


  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [structuresResponse, employeesResponse, companiesResponse] =
        await Promise.all([
          hrService.getSalaryStructures(scopedCompanies),
          hrService.getEmployees(scopedCompanies),
          companyService.getCompanies(),
        ])

      setStructures(structuresResponse.data)
      setEmployees(employeesResponse.data)
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


  // adjustments are kept in the browser so they survive a refresh
  useEffect(() => {
    try {
      localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(adjustments))
    } catch {
      // storage full / blocked - adjustments simply won't persist
    }
  }, [adjustments])


  // attendance / leave / holiday data for the selected payroll month
  useEffect(() => {
    if (tab !== 'payroll' || !month) {
      return undefined
    }

    let cancelled = false
    const { from, to } = monthRange(month)

    setPayrollLoading(true)
    setPayrollError('')

    Promise.all([
      hrService.getAttendanceRange(from, to, scopedCompanies),
      hrService.getHolidays(scopedCompanies),
      hrService.getLeaveRequests(scopedCompanies),
      hrService.getLeaveTypes(scopedCompanies),
    ])
      .then(([attendance, holidays, leaves, leaveTypes]) => {
        if (!cancelled) {
          setPayrollData({
            attendance: attendance.data,
            holidays: holidays.data,
            leaves: leaves.data,
            leaveTypes: leaveTypes.data,
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPayrollError(getErrorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPayrollLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, month])


  const companyName = (id) =>
    companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [Number(e.id), e])),
    [employees]
  )

  const companyOptions = scopedCompanies.length
    ? companies.filter((c) => scopedCompanies.includes(Number(c.id)))
    : companies

  const matchesCompany = (companyId) =>
    companyFilter === 'ALL' ||
    Number(companyId) === Number(companyFilter)


  const visibleStructures = structures.filter((s) =>
    matchesCompany(s.company)
  )

  const withoutStructure = employees.filter(
    (e) =>
      e.is_active &&
      matchesCompany(e.primary_company) &&
      !structures.some((s) => Number(s.user) === Number(e.id))
  )

  const availableEmployees = employees.filter(
    (e) =>
      e.is_active &&
      !structures.some((s) => Number(s.user) === Number(e.id))
  )

  const totalGross = visibleStructures.reduce((sum, s) => sum + grossOf(s), 0)
  const totalNet = visibleStructures.reduce((sum, s) => sum + netOf(s), 0)


  const payrollRows = useMemo(() => {
    const { to } = monthRange(month || currentMonth())

    return structures
      .filter(
        (s) =>
          matchesCompany(s.company) &&
          (!s.effective_from || s.effective_from <= to)
      )
      .map((s) =>
        buildPayrollRow({
          structure: s,
          employee: employeeById.get(Number(s.user)),
          month: month || currentMonth(),
          data: payrollData,
          unmarkedPaid,
          adjustment: num(adjustments[`${month}|${s.user}`]),
        })
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures, employeeById, month, payrollData, unmarkedPaid, adjustments, companyFilter])

  const totals = payrollRows.reduce(
    (sum, row) => ({
      earnings: sum.earnings + row.earnings,
      deductions: sum.deductions + row.deductions,
      adjustment: sum.adjustment + row.adjustment,
      net: sum.net + row.net,
      unmarked: sum.unmarked + row.unmarked,
    }),
    { earnings: 0, deductions: 0, adjustment: 0, net: 0, unmarked: 0 }
  )


  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }


  const openEdit = (structure) => {
    setEditing(structure)

    setForm({
      user: String(structure.user),
      effective_from: structure.effective_from || '',
      basic: String(structure.basic ?? ''),
      allowances: String(structure.allowances ?? ''),
      incentives: String(structure.incentives ?? ''),
      bonus: String(structure.bonus ?? ''),
      other: String(structure.other ?? ''),
      deductions: String(structure.deductions ?? ''),
      note: structure.note || '',
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

    if (!form.user) {
      setError('Please select an employee.')
      return
    }

    if (!(num(form.basic) > 0)) {
      setError('Basic salary must be greater than zero.')
      return
    }

    if (num(form.deductions) > grossOf(form)) {
      setError('Deductions cannot be more than the gross salary.')
      return
    }

    const employee = employeeById.get(Number(form.user))

    setSaving(true)
    setError('')

    try {
      const payload = {
        user: Number(form.user),
        company: employee?.primary_company
          ? Number(employee.primary_company)
          : null,
        effective_from: form.effective_from || null,
        basic: num(form.basic),
        allowances: num(form.allowances),
        incentives: num(form.incentives),
        bonus: num(form.bonus),
        other: num(form.other),
        deductions: num(form.deductions),
        note: form.note.trim(),
      }

      if (editing) {
        await hrService.updateSalaryStructure(editing.id, payload)
      } else {
        await hrService.createSalaryStructure(payload)
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


  const remove = async (structure) => {
    if (
      !(await confirmAction(
        `Remove the salary structure of ${structure.employee_name}?`
      ))
    ) {
      return
    }

    setError('')

    try {
      await hrService.removeSalaryStructure(structure.id)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const setAdjustment = (userId, value) => {
    setAdjustments((current) => ({
      ...current,
      [`${month}|${userId}`]: value,
    }))
  }


  const exportPayroll = () => {
    downloadCsv(
      `payroll-${month}.csv`,
      [
        { key: 'code', label: 'Employee ID' },
        { key: 'name', label: 'Employee' },
        { key: 'company', label: 'Company', csv: (r) => companyName(r.company) },
        { key: 'days', label: 'Days in month' },
        { key: 'worked', label: 'Days present' },
        { key: 'halfDays', label: 'Half days' },
        { key: 'paidLeave', label: 'Paid leave' },
        { key: 'unpaidLeave', label: 'Unpaid leave' },
        { key: 'absent', label: 'Absent' },
        { key: 'unmarked', label: 'Unmarked' },
        { key: 'payableDays', label: 'Payable days' },
        { key: 'basic', label: 'Basic' },
        { key: 'allowances', label: 'Allowances' },
        { key: 'other', label: 'Other' },
        { key: 'incentives', label: 'Incentives' },
        { key: 'bonus', label: 'Bonus' },
        { key: 'earnings', label: 'Earnings (prorated)' },
        { key: 'deductions', label: 'Deductions' },
        { key: 'adjustment', label: 'Adjustment' },
        { key: 'net', label: 'Net payable' },
      ],
      payrollRows
    )
  }


  if (!canManage) {
    return (
      <div className="hr-page">
        <section className="company-panel company-no-access">
          <h1>Payroll</h1>
          <p>Your current role does not have access to payroll.</p>
        </section>
      </div>
    )
  }


  const formGross = grossOf(form)
  const formNet = formGross - num(form.deductions)
  const isRunningMonth = month === currentMonth()
  const isFutureMonth = month > currentMonth()


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
          <h1>Payroll</h1>
          <p>
            Salary structures and monthly payroll, kept separate for each
            company (US-HR-10). Payable salary = salary + attendance + leave
            &minus; deductions &plusmn; approved adjustments.
          </p>
        </div>
      </div>

      <div className="company-tabs">
        <button
          type="button"
          className={tab === 'structures' ? 'company-tab active' : 'company-tab'}
          onClick={() => setTab('structures')}
        >
          Salary structures
        </button>

        <button
          type="button"
          className={tab === 'payroll' ? 'company-tab active' : 'company-tab'}
          onClick={() => setTab('payroll')}
        >
          Monthly payroll
        </button>
      </div>

      <section className="company-panel">

        <div className="hr-filters">
          <select
            className="company-select"
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="ALL">All companies</option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          {tab === 'payroll' && (
            <>
              <input
                className="company-select"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />

              <select
                className="company-select"
                value={unmarkedPaid ? 'PAID' : 'UNPAID'}
                onChange={(event) =>
                  setUnmarkedPaid(event.target.value === 'PAID')
                }
              >
                <option value="UNPAID">Unmarked working days: unpaid</option>
                <option value="PAID">Unmarked working days: paid</option>
              </select>
            </>
          )}
        </div>

        {/* ===================== SALARY STRUCTURES ===================== */}

        {tab === 'structures' && (
          <>
            <div className="hr-kpis">
              <div className="hr-kpi-card">
                <div className="hr-kpi-value">{visibleStructures.length}</div>
                <div className="hr-kpi-label">Employees with a structure</div>
              </div>

              <div className="hr-kpi-card">
                <div className="hr-kpi-value">{withoutStructure.length}</div>
                <div className="hr-kpi-label">Active employees without one</div>
              </div>

              <div className="hr-kpi-card">
                <div className="hr-kpi-value">{formatMoney(totalGross)}</div>
                <div className="hr-kpi-label">Monthly gross (full month)</div>
              </div>

              <div className="hr-kpi-card">
                <div className="hr-kpi-value">{formatMoney(totalNet)}</div>
                <div className="hr-kpi-label">Monthly net (full month)</div>
              </div>
            </div>

            <div className="company-toolbar">
              <div>
                <h2>Salary structures</h2>
                <p>Amounts are per month, in rupees.</p>
              </div>

              <Button onClick={openCreate} disabled={availableEmployees.length === 0}>
                + Add salary structure
              </Button>
            </div>

            {error && !modalOpen && <Alert type="error">{error}</Alert>}

            <div className="company-table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Company</th>
                    <th className="hr-num">Basic</th>
                    <th className="hr-num">Allowances</th>
                    <th className="hr-num">Incentive + Bonus + Other</th>
                    <th className="hr-num">Deductions</th>
                    <th className="hr-num">Net (full month)</th>
                    <th>Effective from</th>
                    <th className="company-actions">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="9" className="company-empty">
                        <Spinner tone="brand" label="Loading salary structures..." />
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    visibleStructures.map((structure) => (
                      <tr key={structure.id}>
                        <td>
                          <strong>{structure.employee_name}</strong>
                          <div className="hr-subtext">
                            {employeeById.get(Number(structure.user))?.employee_id || '\u2014'}
                          </div>
                        </td>
                        <td>{companyName(structure.company)}</td>
                        <td className="hr-num">{formatMoney(structure.basic)}</td>
                        <td className="hr-num">{formatMoney(structure.allowances)}</td>
                        <td className="hr-num">
                          {formatMoney(
                            num(structure.incentives) +
                              num(structure.bonus) +
                              num(structure.other)
                          )}
                        </td>
                        <td className="hr-num">{formatMoney(structure.deductions)}</td>
                        <td className="hr-num">
                          <strong>{formatMoney(netOf(structure))}</strong>
                        </td>
                        <td>{formatDate(structure.effective_from)}</td>
                        <td className="company-actions">
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => openEdit(structure)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() => remove(structure)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}

                  {!loading && visibleStructures.length === 0 && (
                    <tr>
                      <td colSpan="9" className="company-empty">
                        No salary structures yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ======================== MONTHLY PAYROLL ======================== */}

        {tab === 'payroll' && (
          <>
            <div className="company-toolbar">
              <div>
                <h2>Payroll for {month}</h2>
                <p>
                  {payrollRows.length} employee
                  {payrollRows.length === 1 ? '' : 's'} &middot; net payable{' '}
                  {formatMoney(totals.net)}
                </p>
              </div>

              <Button
                variant="secondary"
                onClick={exportPayroll}
                disabled={payrollRows.length === 0}
              >
                Download CSV
              </Button>
            </div>

            {payrollError && <Alert type="error">{payrollError}</Alert>}

            {(isRunningMonth || isFutureMonth) && (
              <div className="hr-note">
                {isFutureMonth
                  ? 'This month has not started yet - every day is counted as payable.'
                  : 'This month is still running - days that have not happened yet are counted as payable until they pass.'}
              </div>
            )}

            {totals.unmarked > 0 && (
              <div className="hr-note">
                {totals.unmarked} working day{totals.unmarked === 1 ? ' has' : 's have'} no
                attendance mark and {unmarkedPaid ? 'are paid' : 'are treated as unpaid'}.
                Mark them on the Attendance screen for an exact result.
              </div>
            )}

            {withoutStructure.length > 0 && (
              <div className="hr-note">
                {withoutStructure.length} active employee
                {withoutStructure.length === 1 ? ' has' : 's have'} no salary structure and
                {withoutStructure.length === 1 ? ' is' : ' are'} not included.
              </div>
            )}

            <div className="company-table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Company</th>
                    <th className="hr-num">Payable days</th>
                    <th className="hr-num">Unpaid days</th>
                    <th className="hr-num">Unmarked</th>
                    <th className="hr-num">Earnings</th>
                    <th className="hr-num">Deductions</th>
                    <th className="hr-num">Adjustment (+/-)</th>
                    <th className="hr-num">Net payable</th>
                  </tr>
                </thead>

                <tbody>
                  {payrollLoading && (
                    <tr>
                      <td colSpan="9" className="company-empty">
                        <Spinner tone="brand" label="Calculating payroll..." />
                      </td>
                    </tr>
                  )}

                  {!payrollLoading &&
                    payrollRows.map((row) => (
                      <tr key={row.user}>
                        <td>
                          <strong>{row.name}</strong>
                          <div className="hr-subtext">{row.code || '\u2014'}</div>
                        </td>
                        <td>{companyName(row.company)}</td>
                        <td className="hr-num">
                          {row.payableDays} / {row.days}
                        </td>
                        <td className="hr-num">{row.unpaidDays}</td>
                        <td className="hr-num">{row.unmarked}</td>
                        <td className="hr-num">{formatMoney(row.earnings)}</td>
                        <td className="hr-num">{formatMoney(row.deductions)}</td>
                        <td className="hr-num">
                          <input
                            className="hr-adj-input"
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={adjustments[`${month}|${row.user}`] ?? ''}
                            onChange={(event) =>
                              setAdjustment(row.user, event.target.value)
                            }
                          />
                        </td>
                        <td className="hr-num">
                          <strong>{formatMoney(row.net)}</strong>
                        </td>
                      </tr>
                    ))}

                  {!payrollLoading && payrollRows.length === 0 && (
                    <tr>
                      <td colSpan="9" className="company-empty">
                        No salary structures apply to this month.
                      </td>
                    </tr>
                  )}

                  {!payrollLoading && payrollRows.length > 0 && (
                    <tr className="hr-total-row">
                      <td colSpan="5">Total</td>
                      <td className="hr-num">{formatMoney(totals.earnings)}</td>
                      <td className="hr-num">{formatMoney(totals.deductions)}</td>
                      <td className="hr-num">{formatMoney(totals.adjustment)}</td>
                      <td className="hr-num">{formatMoney(totals.net)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit salary structure' : 'Add salary structure'}
          onClose={closeModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add structure'}
              </Button>
            </>
          }
        >
          <Alert type="error">{error}</Alert>

          <form onSubmit={save}>
            <div className="company-form-grid">

              <div className="field company-form-full">
                <label className="field-label">Employee</label>
                <select
                  className="field-input"
                  name="user"
                  value={form.user}
                  onChange={handleChange}
                  disabled={Boolean(editing)}
                  required
                >
                  <option value="">Select employee</option>
                  {(editing ? employees : availableEmployees).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.display_name}
                      {employee.employee_id ? ` (${employee.employee_id})` : ''}
                      {' - '}
                      {employee.company?.name || ''}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Basic salary"
                name="basic"
                type="number"
                min="0"
                step="0.01"
                value={form.basic}
                onChange={handleChange}
                required
              />

              <Input
                label="Allowances"
                name="allowances"
                type="number"
                min="0"
                step="0.01"
                value={form.allowances}
                onChange={handleChange}
              />

              <Input
                label="Incentives"
                name="incentives"
                type="number"
                min="0"
                step="0.01"
                value={form.incentives}
                onChange={handleChange}
              />

              <Input
                label="Bonus"
                name="bonus"
                type="number"
                min="0"
                step="0.01"
                value={form.bonus}
                onChange={handleChange}
              />

              <Input
                label="Other earnings"
                name="other"
                type="number"
                min="0"
                step="0.01"
                value={form.other}
                onChange={handleChange}
              />

              <Input
                label="Deductions"
                name="deductions"
                type="number"
                min="0"
                step="0.01"
                value={form.deductions}
                onChange={handleChange}
              />

              <div className="field">
                <label className="field-label">Effective from</label>
                <input
                  className="field-input"
                  type="date"
                  name="effective_from"
                  value={form.effective_from}
                  onChange={handleChange}
                />
              </div>

              <div className="field">
                <label className="field-label">Note (optional)</label>
                <input
                  className="field-input"
                  name="note"
                  value={form.note}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="hr-note">
              Gross <strong>{formatMoney(formGross)}</strong> &middot; Net{' '}
              <strong>{formatMoney(formNet)}</strong> per full month.
              Salary, allowances and other earnings are prorated by payable days;
              incentives, bonus and deductions are applied in full.
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}