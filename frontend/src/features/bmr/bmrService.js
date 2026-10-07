// Batch manufacturing record API. The BMR is created from the batch plan's
// existing requirement preview on the backend. This module never calculates.
import api from '../../api/axios'

export async function getBmrForPlan(companyId, planId) {
  try {
    const response = await api.get(`/v1/companies/${companyId}/batch-plans/${planId}/bmr/`)
    return response.data
  } catch (error) {
    // 404 means "no BMR yet" for this plan. It is not an empty record.
    if (error?.response?.status === 404) return null
    throw error
  }
}

export async function createBmrForPlan(companyId, planId) {
  const response = await api.post(`/v1/companies/${companyId}/batch-plans/${planId}/bmr/`, {})
  return response.data
}

export async function updateBmrLine(companyId, bmrId, lineId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/bmr/${bmrId}/lines/${lineId}/`, payload)
  return response.data
}
