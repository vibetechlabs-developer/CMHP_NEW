// Formula Master API. Every call names the company and uses the existing
// backend contracts; nothing here calculates a requirement or an approval.
import api from '../../api/axios'

const base = (companyId) => `/v1/companies/${companyId}/formulas`

export async function listFormulas(companyId, { search = '', productId, page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (search) params.search = search
  if (productId) params.product = productId
  const response = await api.get(`${base(companyId)}/`, { params })
  return response.data
}

export async function getFormula(companyId, formulaId) {
  const response = await api.get(`${base(companyId)}/${formulaId}/`)
  return response.data
}

export async function createFormula(companyId, payload) {
  const response = await api.post(`${base(companyId)}/`, payload)
  return response.data
}

export async function listRevisions(companyId, formulaId) {
  const response = await api.get(`${base(companyId)}/${formulaId}/revisions/`)
  return Array.isArray(response.data) ? response.data : response.data.results || []
}

export async function getRevision(companyId, formulaId, revisionId) {
  const response = await api.get(`${base(companyId)}/${formulaId}/revisions/${revisionId}/`)
  return response.data
}

// Empty DRAFT revision. An approved revision is never cloned here.
export async function createRevision(companyId, formulaId, payload) {
  const response = await api.post(`${base(companyId)}/${formulaId}/revisions/`, payload)
  return response.data
}

// Full-list PATCH: `lines` is the complete final list for both raw and
// packaging materials; each existing line keeps its `id`.
export async function updateRevision(companyId, formulaId, revisionId, payload) {
  const response = await api.patch(`${base(companyId)}/${formulaId}/revisions/${revisionId}/`, payload)
  return response.data
}

export async function getRequirementPreview(companyId, formulaId, revisionId, targetOutputQuantity) {
  const response = await api.get(`${base(companyId)}/${formulaId}/revisions/${revisionId}/requirement-preview/`, {
    params: { target_output_quantity: targetOutputQuantity },
  })
  return response.data
}

export async function getApprovalPreview(companyId, formulaId, revisionId) {
  const response = await api.get(`${base(companyId)}/${formulaId}/revisions/${revisionId}/approval-preview/`)
  return response.data
}

export async function approveRevision(companyId, formulaId, revisionId, expectedVersion) {
  const response = await api.post(`${base(companyId)}/${formulaId}/revisions/${revisionId}/approve/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

// Active materials for the line picker (shared catalog, read only).
const MATERIAL_KIND_LABEL = { RAW_MATERIAL: 'Raw material', PACKAGING_MATERIAL: 'Packaging material' }

// `kind` limits the results to one material kind (RAW_MATERIAL or PACKAGING_MATERIAL).
export async function searchMaterials(term, kind) {
  const response = await api.get('/v1/materials/', {
    params: { search: term || undefined, kind: kind || undefined, is_active: true, page_size: 20 },
  })
  return (response.data.results || []).map((material) => ({
    id: material.id,
    label: `${material.name} (${material.code})`,
    meta: [MATERIAL_KIND_LABEL[material.kind] || material.kind, material.base_unit_code].filter(Boolean).join(' · '),
    kind: material.kind,
    code: material.code,
    name: material.name,
    unitCode: material.base_unit_code,
  }))
}

// Builds the FULL final line list for the revision PATCH. Lines of the other
// material kind are sent unchanged; lines of this kind come from the table
// rows. Existing line ids are kept so the backend updates them in place.
export function buildRevisionLinesPayload({ allLines = [], kind, rows = [] }) {
  const other = allLines
    .filter((line) => line.material_type !== kind)
    .map((line) => ({ id: line.id, material_id: line.material_id, quantity: line.quantity, notes: line.notes || '' }))
  const mine = rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    material_id: Number(row.material.id),
    quantity: String(row.quantity).trim(),
    notes: row.notes || '',
    label_claim: row.label_claim || '',
    special_value: row.special_value || '',
    ar_no: row.ar_no || '',
  }))
  return [...other, ...mine]
}

// Decides whether the Approve button may be shown, from the backend's approval
// preview. The backend is the authority: this only reflects its answer.
export function approvalActionState(preview, canApprove) {
  const eligibility = preview?.eligibility
  if (!eligibility) return { canApprove: false, reason: 'Check approval first.' }
  if (!canApprove || !eligibility.actor_has_approve_permission) {
    return { canApprove: false, reason: 'Your account does not have the approval permission (formulas.approve) for this company.' }
  }
  if (!eligibility.ready_to_attempt) {
    return { canApprove: false, reason: 'Approval is blocked. See the reasons above.' }
  }
  return { canApprove: true, reason: '' }
}
