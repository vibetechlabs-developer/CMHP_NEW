// Proves the real submit/approve/reject three-step contract, formula/
// revision persistence calls, and the pure gating helpers - including the
// confirmed fix (approve/reject only ever actionable once SUBMITTED,
// never directly from DRAFT, which the reference frontend got wrong).
// Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import {
  approvalActionState,
  approveRevision,
  buildRevisionLinesPayload,
  createFormula,
  rejectRevision,
  submitActionState,
  submitRevision,
  updateRevision,
} from './formulasService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createFormula / updateRevision', () => {
  it('createFormula sends product_id/base_output_quantity/output_uom_id, never code/name (server-generated)', async () => {
    api.post.mockResolvedValue({ data: { id: 1, code: 'P-F1' } })
    const payload = { product_id: 9, base_output_quantity: '100', output_uom_id: 3 }
    await createFormula(5, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/formulas/', payload)
  })

  it('updateRevision PATCHes the full line list with expected_version', async () => {
    api.patch.mockResolvedValue({ data: { id: 2, version: 2 } })
    const payload = { expected_version: 1, lines: [{ material_id: 7, quantity: '5' }] }
    await updateRevision(5, 1, 2, payload)
    expect(api.patch).toHaveBeenCalledWith('/v1/companies/5/formulas/1/revisions/2/', payload)
  })
})

describe('submit/approve/reject - the confirmed three-step fix', () => {
  it('submitRevision posts expected_version to the submit endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 2, status: 'SUBMITTED' } })
    await submitRevision(5, 1, 2, 3)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/formulas/1/revisions/2/submit/', { expected_version: 3 })
  })

  it('approveRevision posts expected_version to the approve endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 2, status: 'APPROVED' } })
    await approveRevision(5, 1, 2, 3)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/formulas/1/revisions/2/approve/', { expected_version: 3 })
  })

  it('rejectRevision requires a rejection_reason and posts it with expected_version', async () => {
    api.post.mockResolvedValue({ data: { id: 2, status: 'DRAFT' } })
    await rejectRevision(5, 1, 2, 3, 'Missing packaging lines')
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/formulas/1/revisions/2/reject/', {
      expected_version: 3, rejection_reason: 'Missing packaging lines',
    })
  })
})

describe('submitActionState', () => {
  it('only allows submit from DRAFT, with at least one line and formulas.submit', () => {
    expect(submitActionState({ status: 'DRAFT', line_count: 2 }, true).canSubmit).toBe(true)
    expect(submitActionState({ status: 'DRAFT', line_count: 0 }, true).canSubmit).toBe(false)
    expect(submitActionState({ status: 'DRAFT', line_count: 2 }, false).canSubmit).toBe(false)
    expect(submitActionState({ status: 'SUBMITTED', line_count: 2 }, true).canSubmit).toBe(false)
  })
})

describe('approvalActionState - never actionable from DRAFT', () => {
  it('is false for approve/reject when the revision is still DRAFT, regardless of the preview', () => {
    const state = approvalActionState({ eligibility: { ready_to_attempt: true, actor_has_approve_permission: true } }, { status: 'DRAFT' }, true)
    expect(state.canApprove).toBe(false)
    expect(state.canReject).toBe(false)
  })

  it('is true for approve only when SUBMITTED, has formulas.approve, and the backend says ready_to_attempt', () => {
    const state = approvalActionState(
      { eligibility: { ready_to_attempt: true, actor_has_approve_permission: true, blocking_reasons: [] } },
      { status: 'SUBMITTED' },
      true
    )
    expect(state.canApprove).toBe(true)
    expect(state.canReject).toBe(true)
  })

  it('allows reject but not approve when SUBMITTED but blocked', () => {
    const state = approvalActionState(
      { eligibility: { ready_to_attempt: false, actor_has_approve_permission: true, blocking_reasons: [{ message: 'x' }] } },
      { status: 'SUBMITTED' },
      true
    )
    expect(state.canApprove).toBe(false)
    expect(state.canReject).toBe(true)
  })

  it('is false for both when the caller lacks formulas.approve', () => {
    const state = approvalActionState(
      { eligibility: { ready_to_attempt: true, actor_has_approve_permission: false } },
      { status: 'SUBMITTED' },
      false
    )
    expect(state.canApprove).toBe(false)
    expect(state.canReject).toBe(false)
  })
})

describe('buildRevisionLinesPayload', () => {
  it('keeps the other material kind unchanged and builds this kind from the given rows', () => {
    const allLines = [{ id: 1, material_id: 2, material_type: 'PACKAGING_MATERIAL', quantity: '3', notes: '' }]
    const rows = [{ id: null, material: { id: 9 }, quantity: '10', calculation_mode: 'AS_PER_FORMULA' }]
    const result = buildRevisionLinesPayload({ allLines, kind: 'RAW_MATERIAL', rows })
    expect(result).toEqual([
      { id: 1, material_id: 2, quantity: '3', notes: '' },
      { material_id: 9, quantity: '10', notes: '', potency: '', label_claim: '', special_value: '', ar_no: '', calculation_mode: 'AS_PER_FORMULA' },
    ])
  })

  it('includes label_claim fields only in AS_PER_LABEL_CLAIM mode', () => {
    const rows = [{ id: null, material: { id: 9 }, quantity: '10', calculation_mode: 'AS_PER_LABEL_CLAIM', label_claim_quantity: '5', label_claim_uom: { id: 4 } }]
    const result = buildRevisionLinesPayload({ allLines: [], kind: 'RAW_MATERIAL', rows })
    expect(result[0].label_claim_quantity).toBe('5')
    expect(result[0].label_claim_uom_id).toBe(4)
  })
})
