import {
  useEffect,
  useState,
} from 'react'

import useAuth from '../../hooks/useAuth'

import {
  getEmployeeSalaryHistory,
} from './payrollLocalService'

import {
  formatMoney,
} from './hrUtils'

import Alert from '../../components/Alert'

import './Hrms.css'


export default function SalaryHistory() {

  const {
    user,
  } = useAuth()


  const [
    history,
    setHistory,
  ] = useState([])


  useEffect(
    () => {

      if (!user?.id) {
        return
      }


      setHistory(
        getEmployeeSalaryHistory(
          user.id
        )
      )

    },
    [user?.id]
  )


  return (

    <div className="hr-page">

      <div className="hr-header">

        <div>

          <span
            className="dash-pill"
            style={{
              marginBottom: 6,
              display: 'inline-block',
            }}
          >
            MY PAYROLL
          </span>

          <h1>
            Salary History
          </h1>

          <p>
            View your monthly salary and payment status.
          </p>

        </div>

      </div>


      <section className="company-panel">

        {history.length === 0 ? (

          <div className="company-empty">

            No salary payment history is available yet.

          </div>

        ) : (

          <div className="company-table-wrap">

            <table className="company-table">

              <thead>

                <tr>

                  <th>
                    Month
                  </th>

                  <th>
                    Employee
                  </th>

                  <th>
                    Payment Date
                  </th>

                  <th>
                    Reference
                  </th>

                  <th className="hr-num">
                    Amount
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {history.map(
                  (payment) => (

                    <tr
                      key={`${payment.month}-${payment.user}`}
                    >

                      <td>
                        <strong>
                          {payment.month}
                        </strong>
                      </td>

                      <td>
                        {payment.employee_name ||
                          user?.username ||
                          'Employee'}
                      </td>

                      <td>
                        {payment.paid_at
                          ? new Date(
                              payment.paid_at
                            ).toLocaleDateString(
                              'en-IN'
                            )
                          : '—'}
                      </td>

                      <td>
                        {payment.payment_reference ||
                          '—'}
                      </td>

                      <td className="hr-num">

                        <strong>
                          {formatMoney(
                            payment.amount
                          )}
                        </strong>

                      </td>

                      <td>

                        <span className="hr-status hr-status-paid">

                          PAID

                        </span>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </section>

    </div>

  )

}