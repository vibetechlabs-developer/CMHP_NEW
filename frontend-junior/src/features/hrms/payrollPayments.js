const STORAGE_KEY = 'cmhp_payroll_payments_v2'

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}

    return parsed && typeof parsed === 'object'
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function write(data) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    )
  } catch {
    // Ignore localStorage errors in local/mock mode.
  }
}

export function payrollKey(
  month,
  userId
) {
  return `${month}|${userId}`
}

export function getPayrollPayment(
  month,
  userId
) {
  const data = read()

  return (
    data[
      payrollKey(month, userId)
    ] || null
  )
}

export function getPayrollPayments() {
  return read()
}

export function markPayrollPaid({
  month,
  userId,
  amount,
  company,
}) {
  const data = read()

  const key =
    payrollKey(
      month,
      userId
    )

  const existing =
    data[key] || {}

  data[key] = {
    ...existing,

    month,

    userId:
      Number(userId),

    amount:
      Number(amount) || 0,

    company:
      Number(company) || null,

    status:
      'PAID',

    paidAt:
      existing.paidAt ||
      new Date().toISOString(),
  }

  write(data)

  return data[key]
}

export function markPayrollUnpaid(
  month,
  userId
) {
  const data = read()

  const key =
    payrollKey(
      month,
      userId
    )

  if (data[key]) {
    delete data[key]

    write(data)
  }
}

export function isPayrollPaid(
  month,
  userId
) {
  return (
    getPayrollPayment(
      month,
      userId
    )?.status === 'PAID'
  )
}