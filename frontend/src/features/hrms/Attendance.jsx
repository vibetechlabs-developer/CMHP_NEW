import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { getErrorMessage } from '../../utils/errors'

import { hrService } from './hrService'
import { allowedCompanyIds, canManageAttendance } from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const STATUS_OPTIONS = [
  ['PRESENT', 'Present'],
  ['ABSENT', 'Absent'],
  ['HALF_DAY', 'Half Day'],
  ['LATE', 'Late'],
  ['EARLY_EXIT', 'Early Exit'],
  ['LEAVE', 'Leave'],
  ['HOLIDAY', 'Holiday'],
  ['WEEKLY_OFF', 'Weekly Off'],
  ['WFH', 'Work From Home'],
]

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS)

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function timeOf(iso) {
  if (!iso) {
    return '\u2014'
  }

  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}


export default function Attendance() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManageTeam = canManageAttendance(user)

  const [myToday, setMyToday] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [myError, setMyError] = useState('')

  const [date, setDate] = useState(todayStr())
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState('')


  const loadMine = async () => {
    setMyError('')

    try {
      const [todayResponse, historyResponse] = await Promise.all([
        hrService.getMyTodayAttendance(user.id),
        hrService.getMyAttendanceHistory(user.id, 10),
      ])

      setMyToday(todayResponse.data)
      setMyHistory(historyResponse.data)
    } catch (err) {
      setMyError(getErrorMessage(err))
    }
  }


  const loadRoster = async (forDate) => {
    if (!canManageTeam) {
      return
    }

    setRosterLoading(true)
    setRosterError('')

    try {
      const response = await hrService.getAttendanceForDate(
        forDate,
        scopedCompanies
      )

      setRoster(response.data)
    } catch (err) {
      setRosterError(getErrorMessage(err))
    } finally {
      setRosterLoading(false)
    }
  }


  useEffect(() => {
    loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  useEffect(() => {
    loadRoster(date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, canManageTeam])


  const doCheckIn = async () => {
    setBusy(true)
    setMyError('')

    try {
      await hrService.doCheckIn({
        user: user.id,
        company: user.profile?.primary_company,
      })

      await loadMine()

      if (canManageTeam) {
        await loadRoster(date)
      }
    } catch (err) {
      setMyError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }


  const doCheckOut = async () => {
    setBusy(true)
    setMyError('')

    try {
      await hrService.doCheckOut({ user: user.id })

      await loadMine()

      if (canManageTeam) {
        await loadRoster(date)
      }
    } catch (err) {
      setMyError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }


  const markRosterStatus = async (employeeId, status) => {
    setRosterError('')

    try {
      await hrService.markAttendance({
        user: employeeId,
        company: user.profile?.primary_company,
        date,
        status,
      })

      await loadRoster(date)
    } catch (err) {
      setRosterError(getErrorMessage(err))
    }
  }


  const canCheckIn = !myToday || !myToday.check_in
  const canCheckOut = myToday && myToday.check_in && !myToday.check_out


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Attendance</h1>
          <p>
            Check in when you start your day and check out when you
            finish. HR can review and correct the full team roster below.
          </p>
        </div>
      </div>

      {myError && <Alert type="error">{myError}</Alert>}

      <div className="hr-checkin-card">
        <div className="hr-checkin-status">
          <strong>
            {myToday
              ? `Today: ${STATUS_LABEL[myToday.status] || myToday.status}`
              : 'You have not checked in today'}
          </strong>

          <span>{todayStr()}</span>

          <div className="hr-checkin-times">
            <div>
              <span>Check-in</span>
              <strong>{timeOf(myToday?.check_in)}</strong>
            </div>
            <div>
              <span>Check-out</span>
              <strong>{timeOf(myToday?.check_out)}</strong>
            </div>
            {myToday?.working_hours != null && (
              <div>
                <span>Working hours</span>
                <strong>{myToday.working_hours} hrs</strong>
              </div>
            )}
          </div>
        </div>

        <div className="hr-checkin-actions">
          <Button
            onClick={doCheckIn}
            disabled={!canCheckIn || busy}
            loading={busy && canCheckIn}
            loadingText="Checking in..."
          >
            Check In
          </Button>

          <Button
            variant="secondary"
            onClick={doCheckOut}
            disabled={!canCheckOut || busy}
            loading={busy && canCheckOut}
            loadingText="Checking out..."
          >
            Check Out
          </Button>
        </div>
      </div>


      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>My recent attendance</h2>
            <p>Last 10 days</p>
          </div>
        </div>

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Working hours</th>
              </tr>
            </thead>

            <tbody>
              {myHistory.map((record) => (
                <tr key={record.id}>
                  <td>{record.date}</td>
                  <td>
                    <span className={`attendance-status attendance-${record.status}`}>
                      {STATUS_LABEL[record.status] || record.status}
                    </span>
                  </td>
                  <td>{timeOf(record.check_in)}</td>
                  <td>{timeOf(record.check_out)}</td>
                  <td>{record.working_hours ?? '\u2014'}</td>
                </tr>
              ))}

              {myHistory.length === 0 && (
                <tr>
                  <td colSpan="5" className="company-empty">
                    No attendance history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>


      {canManageTeam && (
        <section className="company-panel" style={{ marginTop: 18 }}>
          <div className="company-toolbar">
            <div>
              <h2>Team roster</h2>
              <p>Mark or review attendance for a specific date</p>
            </div>

            <input
              className="company-search"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          {rosterError && <Alert type="error">{rosterError}</Alert>}

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Mark as</th>
                </tr>
              </thead>

              <tbody>
                {rosterLoading && (
                  <tr>
                    <td colSpan="6" className="company-empty">
                      Loading roster...
                    </td>
                  </tr>
                )}

                {!rosterLoading &&
                  roster.map(({ employee, attendance }) => (
                    <tr key={employee.id}>
                      <td>
                        <strong>{employee.display_name}</strong>
                        <span className="company-address">
                          {employee.employee_id || employee.username}
                        </span>
                      </td>

                      <td>
                        {employee.company ? (
                          <span className="company-code">
                            {employee.company.code}
                          </span>
                        ) : (
                          '\u2014'
                        )}
                      </td>

                      <td>
                        <span
                          className={`attendance-status attendance-${
                            attendance?.status || 'NOT_MARKED'
                          }`}
                        >
                          {attendance
                            ? STATUS_LABEL[attendance.status] || attendance.status
                            : 'Not marked'}
                        </span>
                      </td>

                      <td>{timeOf(attendance?.check_in)}</td>
                      <td>{timeOf(attendance?.check_out)}</td>

                      <td>
                        <select
                          className="hr-mark-select"
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              markRosterStatus(
                                employee.id,
                                event.target.value
                              )
                            }
                          }}
                        >
                          <option value="">Set status...</option>
                          {STATUS_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}

                {!rosterLoading && roster.length === 0 && (
                  <tr>
                    <td colSpan="6" className="company-empty">
                      No employees in scope for this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}