import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Navigate,
} from 'react-router-dom'

import useAuth
  from '../../hooks/useAuth'

import Alert
  from '../../components/Alert'

import Button
  from '../../components/Button'

import {
  store,
} from '../../store/store'

import {
  hrService,
} from './hrService'

import {
  allowedCompanyIds,
  canManagePayroll,
} from './permissions'

import {
  currentMonth,
  formatMoney,
} from './hrUtils'

import {
  getPayrollPayment,
} from './payrollPayments'
import { logAudit } from '../../utils/audit'

import './Hrms.css'
import './MySalary.css'


/* =========================================================
   COMPANY NAMES
   ========================================================= */

const COMPANY_LEGAL_NAMES = {
  1: 'CMHP',
  2: 'Tej Biocare',
}


/* =========================================================
   HELPERS
   ========================================================= */

function getEmployeeName(
  employee
) {

  return (
    employee?.display_name ||
    `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
    employee?.username ||
    'Employee'
  )

}


function getCompanyName(
  companyId,
  companies
) {

  const company =
    companies.find(
      (item) =>
        Number(item.id) ===
        Number(companyId)
    )


  return (
    company?.legal_name ||
    COMPANY_LEGAL_NAMES[
      Number(companyId)
    ] ||
    company?.name ||
    'Company'
  )

}


function employeeMonthlySalary(
  employee
) {

  const value =
    employee?.monthly_salary ??
    employee?.salary ??
    employee?.monthlySalary ??
    employee?.salary_amount


  const amount =
    Number(value)


  return Number.isFinite(amount)
    ? amount
    : 0

}


/* =========================================================
   SALARY STRUCTURE FALLBACK
   ========================================================= */

function buildEmployeeSalaryStructure(
  employee,
  structures,
  month
) {

  if (!employee) {
    return null
  }


  const currentUserId =
    Number(employee.id)


  /*
   * Find salary structure valid for selected month.
   */
  const matchingStructures =
    structures
      .filter(
        (item) =>
          Number(item.user) ===
          currentUserId
      )
      .filter(
        (item) => {

          if (!item.effective_from) {
            return true
          }

          return (
            String(
              item.effective_from
            ) <=
            `${month}-31`
          )

        }
      )
      .sort(
        (a, b) =>
          String(
            b.effective_from || ''
          ).localeCompare(
            String(
              a.effective_from || ''
            )
          )
      )


  const existing =
    matchingStructures[0]


  if (existing) {
    return existing
  }


  /*
   * IMPORTANT:
   *
   * If no salary structure exists,
   * automatically use the salary entered
   * in Add Employee.
   */
  const monthlySalary =
    employeeMonthlySalary(
      employee
    )


  if (!(monthlySalary > 0)) {
    return null
  }


  return {

    id:
      `employee-salary-${employee.id}`,

    user:
      employee.id,

    company:
      employee.primary_company,

    effective_from:
      employee.joining_date ||
      '',

    basic:
      monthlySalary,

    allowances:
      0,

    incentives:
      0,

    bonus:
      0,

    other:
      0,

    deductions:
      0,

    note:
      'Salary from Employee monthly salary.',

    virtual:
      true,

  }

}


/* =========================================================
   SALARY SLIP HTML
   ========================================================= */

function buildSlipHtml({
  employee,
  structure,
  payment,
  month,
  companyName,
}) {

  const basic =
    Number(
      structure?.basic || 0
    )


  const allowances =
    Number(
      structure?.allowances || 0
    )


  const incentives =
    Number(
      structure?.incentives || 0
    )


  const bonus =
    Number(
      structure?.bonus || 0
    )


  const other =
    Number(
      structure?.other || 0
    )


  const deductions =
    Number(
      structure?.deductions || 0
    )


  const gross =
    basic +
    allowances +
    incentives +
    bonus +
    other


  const net =
    Math.max(
      gross -
      deductions,
      0
    )


  const money =
    (value) =>
      new Intl.NumberFormat(
        'en-IN',
        {
          style:
            'currency',

          currency:
            'INR',

          maximumFractionDigits:
            2,
        }
      ).format(
        Number(value) || 0
      )


  const monthLabel =
    new Date(
      `${month}-01T00:00:00`
    ).toLocaleDateString(
      'en-IN',
      {
        month:
          'long',

        year:
          'numeric',
      }
    )


  const paidDate =
    payment?.paidAt
      ? new Date(
          payment.paidAt
        ).toLocaleDateString(
          'en-IN',
          {
            day:
              '2-digit',

            month:
              'short',

            year:
              'numeric',
          }
        )
      : '—'


  return `<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>
Salary Slip - ${companyName} - ${monthLabel}
</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  padding: 32px;

  background: #eef6fa;

  color: #173b5f;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

}

.sheet {

  max-width: 850px;

  margin: 0 auto;

  background: #ffffff;

  border: 1px solid #d8e8f1;

  border-radius: 16px;

  padding: 34px;

}

.head {

  display: flex;

  justify-content: space-between;

  align-items: flex-start;

  gap: 20px;

  border-bottom:
    2px solid #dcecf5;

  padding-bottom: 20px;

}

.company {

  font-size: 30px;

  font-weight: 800;

  color: #075e9f;

}

.title {

  margin-top: 5px;

  font-size: 16px;

  color: #66819a;

}

.status {

  display: inline-block;

  padding: 8px 14px;

  border-radius: 999px;

  font-weight: 800;

  font-size: 12px;

  background: #e9f8ef;

  color: #16834a;

}

.grid {

  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 18px 28px;

  margin: 28px 0;

}

.label {

  color: #7890a5;

  font-size: 11px;

  text-transform: uppercase;

  letter-spacing: .08em;

}

.value {

  margin-top: 5px;

  font-weight: 700;

  color: #173b5f;

}

table {

  width: 100%;

  border-collapse:
    collapse;

  margin-top: 14px;

}

th,
td {

  padding: 13px 10px;

  border-bottom:
    1px solid #e6eef3;

  text-align: left;

}

th:last-child,
td:last-child {

  text-align: right;

}

th {

  background: #f5f9fc;

}

.total td {

  font-size: 18px;

  font-weight: 900;

  border-bottom: 0;

}

.footer {

  margin-top: 28px;

  padding-top: 16px;

  border-top:
    1px solid #e6eef3;

  font-size: 12px;

  color: #71889b;

}

@media print {

  body {

    padding: 0;

    background: #ffffff;

  }

  .sheet {

    max-width: none;

    border: 0;

    border-radius: 0;

  }

}

</style>

</head>

<body>

<div class="sheet">

  <div class="head">

    <div>

      <div class="company">
        ${companyName}
      </div>

      <div class="title">
        Monthly Salary Slip · ${monthLabel}
      </div>

    </div>

    <div class="status">
      PAID
    </div>

  </div>


  <div class="grid">

    <div>

      <div class="label">
        Employee
      </div>

      <div class="value">
        ${getEmployeeName(employee)}
      </div>

    </div>


    <div>

      <div class="label">
        Employee ID
      </div>

      <div class="value">
        ${
          employee?.employee_id ||
          '—'
        }
      </div>

    </div>


    <div>

      <div class="label">
        Designation
      </div>

      <div class="value">
        ${
          employee?.designation ||
          '—'
        }
      </div>

    </div>


    <div>

      <div class="label">
        Department
      </div>

      <div class="value">
        ${
          employee?.department?.name ||
          '—'
        }
      </div>

    </div>


    <div>

      <div class="label">
        Payroll Month
      </div>

      <div class="value">
        ${monthLabel}
      </div>

    </div>


    <div>

      <div class="label">
        Payment Date
      </div>

      <div class="value">
        ${paidDate}
      </div>

    </div>

  </div>


  <table>

    <thead>

      <tr>

        <th>
          Salary Component
        </th>

        <th>
          Amount
        </th>

      </tr>

    </thead>


    <tbody>

      <tr>

        <td>
          Basic Salary
        </td>

        <td>
          ${money(basic)}
        </td>

      </tr>


      <tr>

        <td>
          Allowances
        </td>

        <td>
          ${money(allowances)}
        </td>

      </tr>


      <tr>

        <td>
          Incentives
        </td>

        <td>
          ${money(incentives)}
        </td>

      </tr>


      <tr>

        <td>
          Bonus
        </td>

        <td>
          ${money(bonus)}
        </td>

      </tr>


      <tr>

        <td>
          Other Earnings
        </td>

        <td>
          ${money(other)}
        </td>

      </tr>


      <tr>

        <td>
          Deductions
        </td>

        <td>
          - ${money(deductions)}
        </td>

      </tr>


      <tr class="total">

        <td>
          Net Salary Paid
        </td>

        <td>
          ${money(net)}
        </td>

      </tr>

    </tbody>

  </table>


  <div class="footer">

    <strong>
      ${companyName}
    </strong>

    <br>

    This is a system-generated salary slip
    from the CMHP ERP HRMS.

    <br><br>

    Payment Reference:
    ${
      payment?.payment_reference ||
      '—'
    }

  </div>

</div>


<script>

window.onload = function () {

  window.print();

}

</script>

</body>

</html>`

}


/* =========================================================
   OPEN / PRINT SALARY SLIP
   ========================================================= */

function printSalarySlip({
  employee,
  structure,
  payment,
  month,
  companyName,
}) {
  const effectivePayment = payment || {
    status: 'ISSUED',
    paidAt: new Date().toISOString(),
  }

  const html =
    buildSlipHtml({
      employee,
      structure,
      payment: effectivePayment,
      month,
      companyName,
    })

  const popup =
    window.open(
      '',
      '_blank',
      'width=950,height=900'
    )

  if (!popup) {
    throw new Error(
      'Please allow popups to open the salary slip.'
    )
  }

  popup.document.open()
  popup.document.write(
    html
  )
  popup.document.close()
}


/* =========================================================
   DOWNLOAD SALARY SLIP
   ========================================================= */

function downloadSalarySlip({
  employee,
  structure,
  payment,
  month,
  companyName,
}) {
  const effectivePayment = payment || {
    status: 'ISSUED',
    paidAt: new Date().toISOString(),
  }

  const html =
    buildSlipHtml({
      employee,
      structure,
      payment: effectivePayment,
      month,
      companyName,
    })




  /*
   * Download an HTML copy of the salary slip.
   *
   * The employee can also use
   * Print / Save PDF for a PDF file.
   */

  const blob =
    new Blob(
      [
        html,
      ],
      {
        type:
          'text/html;charset=utf-8',
      }
    )


  const url =
    URL.createObjectURL(
      blob
    )


  const link =
    document.createElement(
      'a'
    )


  const employeeId =
    employee?.employee_id ||
    employee?.id ||
    'employee'


  link.href =
    url


  link.download =
    `${companyName}-Salary-Slip-${employeeId}-${month}.html`


  document.body.appendChild(
    link
  )


  link.click()


  link.remove()


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  )

}


/* =========================================================
   COMPONENT
   ========================================================= */

export default function MySalary() {

  const {
    user,
  } = useAuth()


  const scopedCompanies =
    allowedCompanyIds(
      user
    )


  const [
    month,
    setMonth,
  ] = useState(
    currentMonth()
  )


  const [
    employees,
    setEmployees,
  ] = useState([])


  const [
    structures,
    setStructures,
  ] = useState([])


  const [
    companies,
    setCompanies,
  ] = useState([])


  const [
    error,
    setError,
  ] = useState('')


  const [
    loading,
    setLoading,
  ] = useState(true)


  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0)


  const currentUserId =
    Number(
      user?.id ||
      user?.profile?.id
    )


  const canManage =
    canManagePayroll(
      user
    )


  /* =======================================================
     LOAD EMPLOYEE + SALARY
     ======================================================= */

  useEffect(
    () => {

      let cancelled =
        false


      async function load() {

        setLoading(true)

        setError('')


        try {

          const [
            employeesResponse,
            structuresResponse,
            companyState,
          ] =
            await Promise.all([

              hrService.getEmployees(
                scopedCompanies
              ),

              hrService.getSalaryStructures(
                scopedCompanies
              ),

              Promise.resolve(
                store.getState()
                  .erp
                  .companies ||
                []
              ),

            ])


          if (
            cancelled
          ) {
            return
          }


          setEmployees(
            employeesResponse?.data ||
            employeesResponse ||
            []
          )


          setStructures(
            structuresResponse?.data ||
            structuresResponse ||
            []
          )


          setCompanies(
            companyState
          )

        } catch (err) {

          if (
            !cancelled
          ) {

            setError(
              err?.message ||
              'Unable to load salary information.'
            )

          }

        } finally {

          if (
            !cancelled
          ) {

            setLoading(
              false
            )

          }

        }

      }


      load()


      return () => {

        cancelled = true

      }

    },
    [
      refreshKey,
      JSON.stringify(
        scopedCompanies
      ),
    ]
  )


  /* =======================================================
     CURRENT EMPLOYEE
     ======================================================= */

  const employee =
    useMemo(
      () =>
        employees.find(
          (item) =>
            Number(item.id) ===
            currentUserId
        ) ||
        null,
      [
        employees,
        currentUserId,
      ]
    )


  /* =======================================================
     COMPANY
     ======================================================= */

  const companyId =
    Number(
      employee?.primary_company ||
      employee?.company?.id
    )


  const companyName =
    getCompanyName(
      companyId,
      companies
    )


  /* =======================================================
     SALARY STRUCTURE
     ======================================================= */

  const structure =
    useMemo(
      () =>
        buildEmployeeSalaryStructure(
          employee,
          structures,
          month
        ),
      [
        employee,
        structures,
        month,
      ]
    )


  /* =======================================================
     PAYMENT STATUS
     ======================================================= */

  const payment =
    structure
      ? getPayrollPayment(
          month,
          currentUserId
        )
      : null


  /* =======================================================
     TOTALS
     ======================================================= */

  const totals =
    useMemo(
      () => {

        if (
          !structure
        ) {

          return {
            gross: 0,
            deductions: 0,
            net: 0,
          }

        }


        const gross =
          Number(
            structure.basic ||
            0
          ) +
          Number(
            structure.allowances ||
            0
          ) +
          Number(
            structure.incentives ||
            0
          ) +
          Number(
            structure.bonus ||
            0
          ) +
          Number(
            structure.other ||
            0
          )


        const deductions =
          Number(
            structure.deductions ||
            0
          )


        return {

          gross,

          deductions,

          net:
            Math.max(
              gross -
              deductions,
              0
            ),

        }

      },
      [
        structure,
      ]
    )


  /* =======================================================
     ADMIN REDIRECT
     ======================================================= */

  if (
    canManage
  ) {

    return (
      <Navigate
        to="/hrms/payroll"
        replace
      />
    )

  }


  /* =======================================================
     UI
     ======================================================= */

  return (

    <div className="hr-page">

      <div className="hr-header">

        <div>

          <span
            className="dash-pill"
            style={{
              marginBottom: 6,
              display:
                'inline-block',
            }}
          >
            HRMS
          </span>

          <h1>
            My Salary
          </h1>

          <p>
            View your monthly salary,
            payment status and salary slip.
          </p>

        </div>

      </div>


      {error && (

        <Alert type="error">

          {error}

        </Alert>

      )}


      <section
        className="company-panel my-salary-card"
      >

        <div
          className="my-salary-toolbar"
        >

          <div>

            <h2>
              {getEmployeeName(
                employee
              )}
            </h2>

            <p>

              {
                employee?.designation ||
                'Employee'
              }

              {' · '}

              {
                employee?.employee_id ||
                'No employee ID'
              }

            </p>

          </div>


          <div
            className="my-salary-month"
          >

            <label
              htmlFor="salary-month"
            >
              Payroll month
            </label>

            <input
              id="salary-month"
              type="month"
              value={month}
              onChange={
                (event) =>
                  setMonth(
                    event.target.value
                  )
              }
            />

          </div>

        </div>


        {loading && (

          <div
            className="my-salary-empty"
          >

            <strong>
              Loading salary information...
            </strong>

            <p>
              Please wait while your salary
              details are loaded.
            </p>

          </div>

        )}


        {!loading &&
          !structure && (

          <div
            className="my-salary-empty"
          >

            <strong>
              No salary structure found.
            </strong>

            <p>
              Your salary has not been
              configured yet.
            </p>

          </div>

        )}


        {!loading &&
          structure && (

          <>

            <div
              className="my-salary-status-row"
            >

              <div>

                <span
                  className="my-salary-label"
                >
                  Company
                </span>

                <strong>
                  {companyName}
                </strong>

              </div>


              <div>

                <span
                  className="my-salary-label"
                >
                  Gross Salary
                </span>

                <strong>
                  {
                    formatMoney(
                      totals.gross
                    )
                  }
                </strong>

              </div>


              <div>

                <span
                  className="my-salary-label"
                >
                  Net Salary
                </span>

                <strong>
                  {
                    formatMoney(
                      totals.net
                    )
                  }
                </strong>

              </div>


              <div>

                <span
                  className="my-salary-label"
                >
                  Payment Status
                </span>

                <span
                  className={
                    payment
                      ? 'my-salary-paid'
                      : 'my-salary-unpaid'
                  }
                >
                  {
                    payment
                      ? 'PAID'
                      : 'UNPAID'
                  }
                </span>

              </div>

            </div>


            <div
              className="my-salary-grid"
            >

              <div>

                <span>
                  Basic
                </span>

                <strong>
                  {
                    formatMoney(
                      structure.basic
                    )
                  }
                </strong>

              </div>


              <div>

                <span>
                  Allowances
                </span>

                <strong>
                  {
                    formatMoney(
                      structure.allowances
                    )
                  }
                </strong>

              </div>


              <div>

                <span>
                  Incentives
                </span>

                <strong>
                  {
                    formatMoney(
                      structure.incentives
                    )
                  }
                </strong>

              </div>


              <div>

                <span>
                  Bonus
                </span>

                <strong>
                  {
                    formatMoney(
                      structure.bonus
                    )
                  }
                </strong>

              </div>


              <div>

                <span>
                  Other
                </span>

                <strong>
                  {
                    formatMoney(
                      structure.other
                    )
                  }
                </strong>

              </div>


              <div>

                <span>
                  Deductions
                </span>

                <strong>
                  {
                    formatMoney(
                      totals.deductions
                    )
                  }
                </strong>

              </div>

            </div>


            <div
              className="my-salary-footer"
            >

              <div>

                {payment ? (

                  <>

                    <strong>

                      Salary paid on{' '}

                      {
                        payment.paidAt
                          ? new Date(
                              payment.paidAt
                            ).toLocaleDateString(
                              'en-IN',
                              {
                                day:
                                  '2-digit',

                                month:
                                  'short',

                                year:
                                  'numeric',
                              }
                            )
                          : '—'
                      }

                    </strong>

                    <span>
                      Your salary slip is
                      available for download.
                    </span>

                  </>

                ) : (

                  <>

                    <strong>
                      Salary is not paid yet.
                    </strong>

                    <span>
                      The salary slip will become
                      available after Admin/HR
                      marks this month as paid.
                    </span>

                  </>

                )}

              </div>


              <div
                className="my-salary-actions"
              >

                <Button
                  variant="secondary"
                  onClick={() =>
                    setRefreshKey(
                      (value) =>
                        value + 1
                    )
                  }
                >
                  Refresh
                </Button>


                <Button
                  onClick={() => {
                    try {
                      downloadSalarySlip({
                        employee,
                        structure,
                        payment,
                        month,
                        companyName,
                      })

                      logAudit({
                        module: 'HRMS',
                        entity_type: 'Salary Slip',
                        entity_id: employee?.employee_id || employee?.id || '—',
                        action: 'DOWNLOAD_SALARY_SLIP',
                        description: `Downloaded salary slip for ${getEmployeeName(employee)} for ${month}`,
                        company: employee?.primary_company,
                        remarks: `Month: ${month}`,
                      })
                    } catch (err) {
                      setError(
                        err?.message ||
                        'Unable to download salary slip.'
                      )
                    }
                  }}
                  disabled={
                    !structure && !employee
                  }
                >
                  Download Salary Slip
                </Button>


                <Button
                  variant="secondary"
                  onClick={() => {
                    try {
                      printSalarySlip({
                        employee,
                        structure,
                        payment,
                        month,
                        companyName,
                      })

                      logAudit({
                        module: 'HRMS',
                        entity_type: 'Salary Slip',
                        entity_id: employee?.employee_id || employee?.id || '—',
                        action: 'DOWNLOAD_SALARY_SLIP',
                        description: `Printed/Saved PDF salary slip for ${getEmployeeName(employee)} for ${month}`,
                        company: employee?.primary_company,
                        remarks: `Month: ${month}`,
                      })
                    } catch (err) {
                      setError(
                        err?.message ||
                        'Unable to open salary slip.'
                      )
                    }
                  }}
                  disabled={
                    !structure && !employee
                  }
                >
                  Print / Save PDF
                </Button>

              </div>

            </div>

          </>

        )}

      </section>

    </div>

  )

}