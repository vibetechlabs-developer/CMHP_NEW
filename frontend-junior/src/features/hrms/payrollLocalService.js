/*
 * CMHP LOCAL PAYROLL SERVICE
 * ---------------------------------------------------------
 * Local-only payroll persistence.
 *
 * This is intentionally independent from the backend/API.
 * When APIs are connected later, this file can be replaced
 * by API calls without changing the Payroll UI structure.
 */

const PAYMENTS_KEY =
  'cmhp_payroll_payments_v1'

const AUDIT_KEY =
  'cmhp_audit_logs_v1'


function readStorage(key, fallback) {

  try {

    const raw =
      localStorage.getItem(key)

    if (!raw) {
      return fallback
    }

    const parsed =
      JSON.parse(raw)

    return parsed ?? fallback

  } catch {

    return fallback

  }

}


function writeStorage(
  key,
  value
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(value)
    )

  } catch {

    // LocalStorage can be unavailable/full.
    // Keep the application usable.
  }

}


function paymentKey(
  company,
  user,
  month
) {

  return [
    Number(company),
    Number(user),
    month,
  ].join('|')

}


/* =========================================================
   PAYMENT STATUS
   ========================================================= */

export function getPayrollPayments() {

  return readStorage(
    PAYMENTS_KEY,
    {}
  )

}


export function getPayrollPayment(
  company,
  user,
  month
) {

  const payments =
    getPayrollPayments()

  return (
    payments[
      paymentKey(
        company,
        user,
        month
      )
    ] || null
  )

}


export function markPayrollPaid({

  company,
  user,
  month,
  amount,
  employeeName,
  paidBy,

}) {

  const payments =
    getPayrollPayments()

  const key =
    paymentKey(
      company,
      user,
      month
    )


  const existing =
    payments[key]


  const payment = {

    company:
      Number(company),

    user:
      Number(user),

    month,

    amount:
      Number(amount) || 0,

    status:
      'PAID',

    paid_at:
      new Date().toISOString(),

    paid_by:
      paidBy || 'Admin',

    employee_name:
      employeeName || '',

    payment_reference:
      existing?.payment_reference ||
      `PAY-${Date.now()}`,

  }


  payments[key] =
    payment


  writeStorage(
    PAYMENTS_KEY,
    payments
  )


  addAuditLog({

    action:
      'PAYROLL_PAID',

    module:
      'Payroll',

    company:
      company,

    record_id:
      user,

    employee:
      employeeName,

    month,

    amount:
      Number(amount) || 0,

    description:
      `Salary for ${month} marked as paid.`,

    user:
      paidBy || 'Admin',

  })


  return payment

}


export function markPayrollUnpaid({

  company,
  user,
  month,
  employeeName,
  changedBy,

}) {

  const payments =
    getPayrollPayments()

  const key =
    paymentKey(
      company,
      user,
      month
    )


  const previous =
    payments[key]


  delete payments[key]


  writeStorage(
    PAYMENTS_KEY,
    payments
  )


  addAuditLog({

    action:
      'PAYROLL_UNPAID',

    module:
      'Payroll',

    company,

    record_id:
      user,

    employee:
      employeeName,

    month,

    amount:
      previous?.amount || 0,

    description:
      `Salary for ${month} changed to unpaid.`,

    user:
      changedBy || 'Admin',

  })


  return null

}


/* =========================================================
   SALARY HISTORY
   ========================================================= */

export function getEmployeeSalaryHistory(
  userId
) {

  const payments =
    getPayrollPayments()


  return Object.values(
    payments
  )

    .filter(
      (payment) =>
        Number(payment.user) ===
        Number(userId)
    )

    .sort(
      (a, b) =>
        String(b.month).localeCompare(
          String(a.month)
        )
    )

}


/* =========================================================
   AUDIT LOG
   ========================================================= */

export function getAuditLogs() {

  return readStorage(
    AUDIT_KEY,
    []
  )

}


export function addAuditLog(
  entry
) {

  const logs =
    getAuditLogs()


  logs.unshift({

    id:
      `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,

    timestamp:
      new Date().toISOString(),

    ...entry,

  })


  /*
   * Keep the local audit log manageable.
   */
  writeStorage(
    AUDIT_KEY,
    logs.slice(
      0,
      1000
    )
  )

}


export function clearAuditLogs() {

  writeStorage(
    AUDIT_KEY,
    []
  )

}


/* =========================================================
   PAYSLIP
   ========================================================= */

export function printPayslip({
  employee,
  row,
  month,
  payment,
}) {

  const employeeName =
    employee?.display_name ||
    employee?.username ||
    row?.name ||
    'Employee'


  const html = `

    <!doctype html>

    <html>

      <head>

        <title>
          Payslip - ${employeeName} - ${month}
        </title>

        <style>

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            font-family: Arial, sans-serif;
            color: #173b59;
            background: #ffffff;
          }

          .sheet {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #dce7ee;
            border-radius: 14px;
            overflow: hidden;
          }

          .header {
            padding: 24px;
            background: #f1f8fc;
            border-bottom: 1px solid #dce7ee;
          }

          .brand {
            font-size: 24px;
            font-weight: 800;
          }

          .title {
            margin-top: 8px;
            font-size: 18px;
            font-weight: 700;
          }

          .body {
            padding: 24px;
          }

          .employee {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 24px;
          }

          .item {
            padding: 12px;
            background: #f8fbfd;
            border: 1px solid #e2ebf0;
            border-radius: 8px;
          }

          .label {
            font-size: 11px;
            color: #708798;
          }

          .value {
            margin-top: 4px;
            font-size: 14px;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5edf2;
          }

          th {
            background: #f4f8fa;
          }

          .amount {
            text-align: right;
          }

          .net {
            font-size: 20px;
            font-weight: 800;
          }

          .paid {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            background: #e9f8f0;
            color: #16844b;
            font-weight: 700;
          }

          .unpaid {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            background: #fff2e8;
            color: #b75b16;
            font-weight: 700;
          }

          .footer {
            margin-top: 24px;
            font-size: 11px;
            color: #7a8e9d;
          }

          @media print {

            body {
              padding: 0;
            }

            .sheet {
              border: 0;
              border-radius: 0;
            }

          }

        </style>

      </head>

      <body>

        <div class="sheet">

          <div class="header">

            <div class="brand">
              CMHP
            </div>

            <div class="title">
              Monthly Salary Slip
            </div>

          </div>

          <div class="body">

            <div class="employee">

              <div class="item">

                <div class="label">
                  Employee
                </div>

                <div class="value">
                  ${employeeName}
                </div>

              </div>

              <div class="item">

                <div class="label">
                  Employee ID
                </div>

                <div class="value">
                  ${employee?.employee_id || row?.code || '—'}
                </div>

              </div>

              <div class="item">

                <div class="label">
                  Salary Month
                </div>

                <div class="value">
                  ${month}
                </div>

              </div>

              <div class="item">

                <div class="label">
                  Payment Status
                </div>

                <div class="value">

                  ${
                    payment?.status === 'PAID'
                      ? '<span class="paid">PAID</span>'
                      : '<span class="unpaid">UNPAID</span>'
                  }

                </div>

              </div>

            </div>


            <table>

              <thead>

                <tr>

                  <th>
                    Salary Component
                  </th>

                  <th class="amount">
                    Amount
                  </th>

                </tr>

              </thead>

              <tbody>

                <tr>
                  <td>Basic Salary</td>
                  <td class="amount">
                    ₹${Number(row?.basic || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>
                  <td>Allowances</td>
                  <td class="amount">
                    ₹${Number(row?.allowances || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>
                  <td>Incentives</td>
                  <td class="amount">
                    ₹${Number(row?.incentives || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>
                  <td>Bonus</td>
                  <td class="amount">
                    ₹${Number(row?.bonus || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>
                  <td>Other</td>
                  <td class="amount">
                    ₹${Number(row?.other || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>
                  <td>Deductions</td>
                  <td class="amount">
                    -₹${Number(row?.deductions || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>

                <tr>

                  <td class="net">
                    Net Payable
                  </td>

                  <td class="amount net">

                    ₹${Number(row?.net || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2
                    })}

                  </td>

                </tr>

              </tbody>

            </table>


            <div class="footer">

              Payment Reference:
              ${payment?.payment_reference || 'Not paid'}

              <br />

              Generated:
              ${new Date().toLocaleString('en-IN')}

            </div>

          </div>

        </div>


        <script>

          window.onload = function () {
            window.print();
          };

        </script>

      </body>

    </html>

  `


  const popup =
    window.open(
      '',
      '_blank',
      'width=900,height=900'
    )


  if (!popup) {

    throw new Error(
      'Please allow popups to print the payslip.'
    )

  }


  popup.document.write(
    html
  )

  popup.document.close()

}