import api from '../../api/axios'
import { getScopedCompanyId } from '../../utils/companyScope'

function getCompanyId() {
  const companyId = getScopedCompanyId()
  if (!companyId) {
    throw new Error('No active company is selected.')
  }
  return Number(companyId)
}

const hrmsBase = (cid) => `/v1/companies/${cid}/hrms`

export async function getPayrollPayments() {
  try {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/payroll/records/`)
    const records = Array.isArray(res.data) ? res.data : res.data.results || []
    const map = {}
    records.forEach((r) => {
      const key = `${r.company}|${r.user}|${r.month}`
      map[key] = {
        company: r.company,
        user: r.user,
        month: r.month,
        amount: Number(r.net_salary || 0),
        status: r.status,
        paymentDate: r.payment_date,
        paidAt: r.payment_date,
        paymentMode: r.payment_mode,
        referenceNumber: r.reference_number,
      }
    })
    return map
  } catch (err) {
    console.error('Failed to get payroll payments:', err)
    return {}
  }
}

export async function getPayrollPayment(company, user, month) {
  const payments = await getPayrollPayments()
  const key = `${Number(company)}|${Number(user)}|${month}`
  return payments[key] || null
}

export async function markPayrollPaid({
  company,
  user,
  month,
  amount,
  employeeName,
  paidBy,
  paymentMode = 'BANK_TRANSFER',
  referenceNumber = '',
}) {
  const cid = Number(company) || getCompanyId()
  const res = await api.post(`${hrmsBase(cid)}/payroll/mark-paid/`, {
    user_id: user,
    month,
    amount,
    payment_mode: paymentMode,
    reference_number: referenceNumber,
  })
  return res.data
}

export async function markPayrollUnpaid({ company, user, month }) {
  const cid = Number(company) || getCompanyId()
  const res = await api.post(`${hrmsBase(cid)}/payroll/mark-unpaid/`, {
    user_id: user,
    month,
  })
  return res.data
}

export async function getEmployeeSalaryHistory(company, user) {
  const cid = Number(company) || getCompanyId()
  const res = await api.get(`${hrmsBase(cid)}/payroll/records/`, {
    params: { user },
  })
  return Array.isArray(res.data) ? res.data : res.data.results || []
}

export async function getAuditLogs(company) {
  return []
}

export async function addAuditLog(entry) {
  return entry
}

export function clearAuditLogs(company) {
  return true
}

export function printPayslip(payment) {
  window.print()
}