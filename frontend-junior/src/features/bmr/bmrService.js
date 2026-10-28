// Real apps.bmr integration. Ported from frontend/src/features/bmr/
// bmrService.js verbatim - endpoint paths verified against the current
// apps/bmr/urls.py.
import api from '../../api/axios'

// null on 404 - means "no BMR exists yet for this plan", not an empty record.
export async function getBmrForPlan(companyId, planId) {
  try {
    const response = await api.get(`/v1/companies/${companyId}/batch-plans/${planId}/bmr/`)
    return response.data
  } catch (err) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

// Creates the BMR from the plan's own requirement preview - never a
// second scaling calculation. Refused if one already exists, or if the
// preview is not calculation_complete.
export async function createBmrForPlan(companyId, planId) {
  const response = await api.post(`/v1/companies/${companyId}/batch-plans/${planId}/bmr/`, {})
  return response.data
}

// Only special_value/label_claim/ar_no/qty_received are ever writable -
// required quantities (required_text) are never editable through any endpoint.
export async function updateBmrLine(companyId, bmrId, lineId, payload) {
  const response = await api.patch(`/v1/companies/${companyId}/bmr/${bmrId}/lines/${lineId}/`, payload)
  return response.data
}
