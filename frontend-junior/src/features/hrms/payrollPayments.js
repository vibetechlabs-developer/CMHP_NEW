import api from '../../api/axios'
import { getScopedCompanyId } from '../../utils/companyScope'

function getCompanyId() {
  const companyId = getScopedCompanyId()
  return companyId ? Number(companyId) : 2
}

const hrmsBase = (cid) => `/v1/companies/${cid}/hrms`

export function payrollKey(month, userId) {
  return `${month}|${userId}`
}

export async function getPayrollPayment(month, userId) {
  const payments = await getPayrollPayments()
  return payments[payrollKey(month, userId)] || null
}

export async function getPayrollPayments() {
  try {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/payroll/records/`)
    const records = Array.isArray(res.data) ? res.data : res.data.results || []
    const map = {}
    records.forEach((r) => {
      const key = payrollKey(r.month, r.user)
      map[key] = {
        month: r.month,
        userId: Number(r.user),
        amount: Number(r.net_salary || 0),
        company: r.company,
        status: r.status,
        paidAt: r.payment_date,
      }
    })
    return map
  } catch (err) {
    return {}
  }
}

export async function markPayrollPaid({ month, userId, amount, company }) {
  const cid = company ? Number(company) : getCompanyId()
  const res = await api.post(`${hrmsBase(cid)}/payroll/mark-paid/`, {
    month,
    user_id: userId,
    amount,
  })
  return {
    month,
    userId: Number(userId),
    amount: Number(amount) || 0,
    company: cid,
    status: 'PAID',
    paidAt: res.data?.payment_date || new Date().toISOString(),
  }
}

export async function markPayrollUnpaid(month, userId) {
  const cid = getCompanyId()
  await api.post(`${hrmsBase(cid)}/payroll/mark-unpaid/`, {
    month,
    user_id: userId,
  })
}

export async function isPayrollPaid(month, userId) {
  const payment = await getPayrollPayment(month, userId)
  return payment?.status === 'PAID'
}