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

export const hrService = {
  // =========================================================================
  // EMPLOYEES
  // =========================================================================
  async getEmployees(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/employees/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async getEmployee(id) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/employees/${id}/`)
    return { data: res.data }
  },

  async createEmployee(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/employees/`, payload)
    return { data: res.data }
  },

  async updateEmployee(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/employees/${id}/`, payload)
    return { data: res.data }
  },

  async deactivateEmployee(id) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/employees/${id}/deactivate/`)
    return { data: res.data }
  },

  async reactivateEmployee(id) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/employees/${id}/activate/`)
    return { data: res.data }
  },

  async deleteEmployee(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/employees/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // DESIGNATIONS
  // =========================================================================
  async getDesignations(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/designations/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async createDesignation(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/designations/`, payload)
    return { data: res.data }
  },

  async updateDesignation(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/designations/${id}/`, payload)
    return { data: res.data }
  },

  async deactivateDesignation(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/designations/${id}/`, { is_active: false })
    return { data: res.data }
  },

  async reactivateDesignation(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/designations/${id}/`, { is_active: true })
    return { data: res.data }
  },

  async deleteDesignation(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/designations/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // SHIFTS
  // =========================================================================
  async getShifts(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/shifts/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async createShift(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/shifts/`, payload)
    return { data: res.data }
  },

  async updateShift(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/shifts/${id}/`, payload)
    return { data: res.data }
  },

  async deactivateShift(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/shifts/${id}/`, { is_active: false })
    return { data: res.data }
  },

  async reactivateShift(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/shifts/${id}/`, { is_active: true })
    return { data: res.data }
  },

  async deleteShift(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/shifts/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // HOLIDAYS
  // =========================================================================
  async getHolidays(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/holidays/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async createHoliday(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/holidays/`, payload)
    return { data: res.data }
  },

  async updateHoliday(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/holidays/${id}/`, payload)
    return { data: res.data }
  },

  async deleteHoliday(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/holidays/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // LEAVE TYPES
  // =========================================================================
  async getLeaveTypes(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/leave-types/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async createLeaveType(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/leave-types/`, payload)
    return { data: res.data }
  },

  async updateLeaveType(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/leave-types/${id}/`, payload)
    return { data: res.data }
  },

  async deactivateLeaveType(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/leave-types/${id}/`, { is_active: false })
    return { data: res.data }
  },

  async reactivateLeaveType(id) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/leave-types/${id}/`, { is_active: true })
    return { data: res.data }
  },

  async deleteLeaveType(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/leave-types/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // ATTENDANCE & PUNCH OPERATIONS
  // =========================================================================
  async getMyTodayAttendance(userId) {
    const cid = getCompanyId()
    const today = new Date().toISOString().slice(0, 10)
    const res = await api.get(`${hrmsBase(cid)}/attendance/`, {
      params: { user: userId, date: today },
    })
    const list = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data: list[0] || null }
  },

  async getMyAttendanceHistory(userId, days = 14) {
    const cid = getCompanyId()
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    const res = await api.get(`${hrmsBase(cid)}/attendance/`, {
      params: {
        user: userId,
        from_date: from.toISOString().slice(0, 10),
        to_date: to.toISOString().slice(0, 10),
      },
    })
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async doCheckIn(payload) {
    const cid = getCompanyId()
    const userId = typeof payload === 'object' ? payload?.user || payload?.user_id : payload
    const res = await api.post(`${hrmsBase(cid)}/attendance/check-in/`, { user_id: userId })
    return { data: res.data }
  },

  async doCheckOut(payload) {
    const cid = getCompanyId()
    const userId = typeof payload === 'object' ? payload?.user || payload?.user_id : payload
    const res = await api.post(`${hrmsBase(cid)}/attendance/check-out/`, { user_id: userId })
    return { data: res.data }
  },

  async getAttendanceForDate(date, scopedCompanyIds) {
    const cid = getCompanyId()
    const [attRes, empRes] = await Promise.all([
      api.get(`${hrmsBase(cid)}/attendance/`, { params: { date } }),
      api.get(`${hrmsBase(cid)}/employees/`),
    ])

    const records = Array.isArray(attRes.data) ? attRes.data : attRes.data.results || []
    const employees = Array.isArray(empRes.data) ? empRes.data : empRes.data.results || []

    const attMap = {}
    records.forEach((r) => {
      attMap[r.user] = r
    })

    const roster = employees.map((emp) => ({
      employee: emp,
      attendance: attMap[emp.id] || null,
    }))

    return { data: roster }
  },

  async getAttendanceRange(from, to, scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/attendance/`, {
      params: { from_date: from, to_date: to },
    })
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async markAttendance(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/attendance/`, payload)
    return { data: res.data }
  },

  async updateAttendance(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/attendance/${id}/`, payload)
    return { data: res.data }
  },

  async removeAttendance(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/attendance/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // LEAVE REQUESTS
  // =========================================================================
  async getMyLeaveRequests(userId) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/leave-requests/`, {
      params: { user: userId },
    })
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async getLeaveRequests(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/leave-requests/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async submitLeaveRequest(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/leave-requests/`, payload)
    return { data: res.data }
  },

  async decideLeave(leaveId, decision, rejectionReason = '') {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/leave-requests/${leaveId}/decision/`, {
      decision,
      rejection_reason: rejectionReason,
    })
    return { data: res.data }
  },

  async decideLeaveRequest(leaveId, decision, rejectionReason = '') {
    return this.decideLeave(leaveId, decision, rejectionReason)
  },

  async cancelLeaveRequest(leaveId) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/leave-requests/${leaveId}/cancel/`)
    return { data: res.data }
  },

  async removeLeaveRequest(leaveId) {
    return this.cancelLeaveRequest(leaveId)
  },

  // =========================================================================
  // SALARY STRUCTURES
  // =========================================================================
  async getSalaryStructures(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/salary-structures/`)
    const data = Array.isArray(res.data) ? res.data : res.data.results || []
    return { data }
  },

  async createSalaryStructure(payload) {
    const cid = getCompanyId()
    const res = await api.post(`${hrmsBase(cid)}/salary-structures/`, payload)
    return { data: res.data }
  },

  async updateSalaryStructure(id, payload) {
    const cid = getCompanyId()
    const res = await api.patch(`${hrmsBase(cid)}/salary-structures/${id}/`, payload)
    return { data: res.data }
  },

  async removeSalaryStructure(id) {
    const cid = getCompanyId()
    const res = await api.delete(`${hrmsBase(cid)}/salary-structures/${id}/`)
    return { data: res.data }
  },

  // =========================================================================
  // DASHBOARD SUMMARY
  // =========================================================================
  async getDashboardSummary(scopedCompanyIds) {
    const cid = getCompanyId()
    const res = await api.get(`${hrmsBase(cid)}/dashboard/summary/`)
    return { data: res.data }
  },
}