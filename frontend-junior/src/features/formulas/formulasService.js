// Formula Master API. Every call names the company and uses the existing
// backend contracts; nothing here calculates a requirement or an
// approval. Ported from frontend/src/features/formulas/formulasService.js
// with one confirmed fix: that reference calls approveRevision directly
// against a DRAFT revision, but the current backend's assess_approval
// requires status SUBMITTED first (REVISION_NOT_SUBMITTED otherwise) -
// submitRevision/rejectRevision (both real, already-existing endpoints
// the reference never calls) are added here to close that gap.
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

// DRAFT -> SUBMITTED. Required before approve/reject can act on a
// revision - see this file's own top comment.
export async function submitRevision(companyId, formulaId, revisionId, expectedVersion) {
  const response = await api.post(`${base(companyId)}/${formulaId}/revisions/${revisionId}/submit/`, {
    expected_version: expectedVersion,
  })
  return response.data
}

export async function approveRevision(companyId, formulaId, revisionId, expectedVersion, approvalRemarks = '') {
  const payload = { expected_version: expectedVersion }
  if (approvalRemarks && typeof approvalRemarks === 'string') {
    payload.approval_remarks = approvalRemarks.trim()
  }
  const response = await api.post(`${base(companyId)}/${formulaId}/revisions/${revisionId}/approve/`, payload)
  return response.data
}

// SUBMITTED -> DRAFT, with a required reason. formulas.approve-gated -
// the same permission as approve, since rejecting is the other half of
// the same review decision.
export async function rejectRevision(companyId, formulaId, revisionId, expectedVersion, rejectionReason) {
  const response = await api.post(`${base(companyId)}/${formulaId}/revisions/${revisionId}/reject/`, {
    expected_version: expectedVersion,
    rejection_reason: rejectionReason,
  })
  return response.data
}

// Active materials for the line picker (shared catalog, read only).
const MATERIAL_KIND_LABEL = {
  RAW_MATERIAL: 'Raw material',
  PACKAGING_MATERIAL: 'Packaging material',
  MOTHER_TINCTURE: 'Mother Tincture',
}

// `kind` limits the results to material kinds. When searching raw materials, also search mother tinctures.
export async function searchMaterials(term, kind, pageSize = 100) {
  const queryKind = kind === 'RAW_MATERIAL' ? 'RAW_MATERIAL,MOTHER_TINCTURE' : kind || undefined
  const response = await api.get('/v1/materials/', {
    params: { search: term || undefined, kind: queryKind, is_active: true, page_size: pageSize },
  })
  return (response.data.results || []).map((material) => ({
    id: material.id,
    label: `${material.name} (${material.code})`,
    meta: [MATERIAL_KIND_LABEL[material.kind] || material.kind, material.base_unit_code].filter(Boolean).join(' · '),
    kind: material.kind,
    code: material.code,
    name: material.name,
    unitCode: material.base_unit_code,
    alcoholPercentage: material.alcohol_percentage != null ? Number(material.alcohol_percentage) : 0,
  }))
}

// Builds the FULL final line list for the revision PATCH. Lines of the other
// material kind are sent unchanged; lines of this kind come from the table
// rows. Existing line ids are kept so the backend updates them in place.
export function buildRevisionLinesPayload({ allLines = [], kind, rows = [] }) {
  const other = allLines
    .filter((line) => line.material_type !== kind)
    .map((line) => ({ id: line.id, material_id: line.material_id, quantity: line.quantity, notes: line.notes || '' }))
  const mine = rows.map((row) => {
    const hasStructuredClaim = Boolean(
      row.calculation_mode === 'AS_PER_LABEL_CLAIM' &&
      row.label_claim_quantity &&
      String(row.label_claim_quantity).trim() !== '' &&
      Number(row.label_claim_quantity) > 0 &&
      row.label_claim_uom &&
      row.label_claim_uom.id
    )
    const backendCalcMode = hasStructuredClaim ? 'AS_PER_LABEL_CLAIM' : 'AS_PER_FORMULA'

    const rawQty = String(row.quantity ?? '').trim()
    const isNA = ['N/A', 'NA', 'N.A.', '-', '0', ''].includes(rawQty.toUpperCase())
    const numQty = Number(rawQty)
    const isCountUnit = row.unit === 'PCS' || row.unit === 'NOS' || row.unit === 'BOX' || row.unit === 'BTL' || !row.unit || kind === 'PACKAGING_MATERIAL' || kind === 'PACKAGING'

    let finalQty = '1'
    if (!isNA && !isNaN(numQty) && numQty > 0) {
      // For COUNT units (PCS, NOS, BOX, BTL, or any packaging), send whole number
      // For MASS/VOLUME units, send the exact decimal
      finalQty = isCountUnit ? String(Math.round(numQty)) : String(numQty)
    } else {
      // N/A, empty, zero, or non-numeric: use '1' as safe fallback for ALL unit types.
      // '1' satisfies: COUNT dimension (1 % 1 == 0) AND min_value=0.001 (1 > 0.001).
      // Previously '0.001' was used for non-count units, but that fails if the backend
      // unit has COUNT dimension but is not in the frontend's hardcoded list (e.g. TAB, PC).
      finalQty = '1'
    }

    const displayQtyText = isNA ? (rawQty || 'N/A') : rawQty
    const finalSpecial = row.special_value || (isNA ? displayQtyText : '')

    const noteParts = []
    if (row.quantity_received != null && String(row.quantity_received).trim() !== '') {
      noteParts.push(`RECV:${String(row.quantity_received).trim()}`)
    }
    if (isNA) {
      noteParts.push(`QTY_TEXT:${displayQtyText}`)
    }
    if (row.notes && !row.notes.startsWith('RECV:') && !row.notes.startsWith('QTY_TEXT:') && !row.notes.includes('|')) {
      noteParts.push(row.notes)
    }
    const finalNotes = noteParts.join(' | ')

    return {
      ...(row.id ? { id: row.id } : {}),
      material_id: Number(row.material.id),
      quantity: finalQty,
      notes: finalNotes,
      potency: row.potency || '',
      label_claim: row.label_claim || '',
      special_value: finalSpecial,
      ar_no: row.ar_no || '',
      calculation_mode: backendCalcMode,
      ...(row.unit ? { unit_code: row.unit } : {}),
      // Only sent in structured label-claim mode - the server rejects them outright if
      // present under AS_PER_FORMULA (apps.formulas.services._resolve_calculation_mode).
      ...(hasStructuredClaim
        ? {
            label_claim_quantity: String(row.label_claim_quantity).trim(),
            label_claim_uom_id: Number(row.label_claim_uom.id),
          }
        : {}),
    }
  })
  return [...other, ...mine]
}

// Decides whether the Submit button may be shown - a DRAFT revision with
// at least one line and formulas.submit.
export function submitActionState(revision, canSubmit) {
  if (revision?.status !== 'DRAFT') return { canSubmit: false, reason: '' }
  if (!canSubmit) return { canSubmit: false, reason: 'No formulas.submit permission for this company.' }
  // Accept line_count from the API summary, or fall back to the lines array length
  const lineCount = revision.line_count ?? (revision.lines?.length || 0)
  if (!lineCount) return { canSubmit: false, reason: 'Add at least one material line before submitting.' }
  return { canSubmit: true, reason: '' }
}

// Decides whether the Approve/Reject buttons may be shown, from the
// backend's approval preview. The backend is the authority: this only
// reflects its answer, and only once the revision is SUBMITTED (approve/
// reject both fold a DRAFT or APPROVED revision into "not actionable").
export function approvalActionState(preview, revision, canApprove) {
  if (revision?.status !== 'SUBMITTED') return { canApprove: false, canReject: false, reason: '' }
  const eligibility = preview?.eligibility
  if (!eligibility) return { canApprove: false, canReject: Boolean(canApprove), reason: 'Check approval first.' }
  if (!canApprove || !eligibility.actor_has_approve_permission) {
    return { canApprove: false, canReject: false, reason: 'Your account does not have the approval permission (formulas.approve) for this company.' }
  }
  if (!eligibility.ready_to_attempt) {
    return { canApprove: false, canReject: true, reason: 'Approval is blocked. See the reasons above - you can still reject it back to draft.' }
  }
  return { canApprove: true, canReject: true, reason: '' }
}
