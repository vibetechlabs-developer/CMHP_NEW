import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errors'

import { hrService } from './hrService'
import { allowedCompanyIds, canViewHrReports } from './permissions'
import { LoadingState } from '../../components/Spinner'

import '../dashboard/Dashboard.css'
import './Hrms.css'


export default function HrDashboard() {
  const { user } = useAuth()

  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  const scopedCompanies = allowedCompanyIds(user)
  const canSeeApprovals = canViewHrReports(user)


  useEffect(() => {
    // Wrapped so a missing company is shown as an error instead of crashing the screen.
    Promise.resolve()
      .then(() => hrService.getDashboardSummary(scopedCompanies))
      .then((response) => setSummary(response.data))
      .catch((err) => setError(getErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const name = user?.first_name || user?.username || 'there'

  const cards = summary
    ? [
        {
          label: 'Total employees',
          value: summary.total_employees,
        },
        {
          label: 'Present today',
          value: summary.present_today,
        },
        {
          label: 'Not marked yet',
          value: summary.not_marked_today,
        },
        {
          label: 'On leave today',
          value: summary.on_leave_today,
        },
        {
          label: 'Company A employees',
          value: summary.company_a_employees,
        },
        {
          label: 'Company B employees',
          value: summary.company_b_employees,
        },
      ]
    : []


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span className="dash-pill">HRMS</span>

          <h1>HR Dashboard, {name}</h1>

          <p>
            Company-wise employee, attendance and leave snapshot.
            {scopedCompanies.length > 0 && (
              ' You are viewing data for your assigned company only.'
            )}
          </p>
        </div>
      </div>


      {error && (
        <section className="dash-card">{error}</section>
      )}


      {!summary && !error && (
        <section className="dash-card">
          <LoadingState label="Loading HR summary…" compact />
        </section>
      )}


      {summary && (
        <>
          <section className="hr-kpis">
            {cards.map((card) => (
              <article className="hr-kpi-card" key={card.label}>
                <div className="hr-kpi-value">{card.value}</div>
                <div className="hr-kpi-label">{card.label}</div>
              </article>
            ))}

            {canSeeApprovals && (
              <article className="hr-kpi-card">
                <div className="hr-kpi-value">
                  {summary.pending_leave_approvals}
                </div>
                <div className="hr-kpi-label">
                  Pending leave approvals
                </div>
              </article>
            )}
          </section>

          <section className="dash-grid">
            <article className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h3 className="dash-card-title">
                    Upcoming holidays
                  </h3>
                  <p className="dash-card-sub">
                    Next 5 holidays on the company calendar
                  </p>
                </div>
              </div>

              {summary.upcoming_holidays.length ? (
                <ul className="activity-list">
                  {summary.upcoming_holidays.map((holiday) => (
                    <li key={holiday.id}>
                      <span className="activity-dot activity-purple" />
                      <div>
                        <p className="activity-title">{holiday.name}</p>
                        <span className="activity-time">{holiday.date}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-empty">
                  No upcoming holidays configured yet.
                </p>
              )}
            </article>

            <article className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h3 className="dash-card-title">Quick links</h3>
                  <p className="dash-card-sub">
                    Jump straight to the HRMS module you need
                  </p>
                </div>
              </div>

              <ul className="activity-list">
                <li>
                  <span className="activity-dot activity-blue" />
                  <div>
                    <p className="activity-title">Mark today&rsquo;s attendance</p>
                    <span className="activity-time">HRMS → Attendance</span>
                  </div>
                </li>
                <li>
                  <span className="activity-dot activity-green" />
                  <div>
                    <p className="activity-title">Manage employee records</p>
                    <span className="activity-time">HRMS → Employees</span>
                  </div>
                </li>
              </ul>
            </article>
          </section>
        </>
      )}

    </div>
  )
}