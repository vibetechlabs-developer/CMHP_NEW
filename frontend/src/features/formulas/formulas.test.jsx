// Synthetic arithmetic fixtures only. These numbers are NOT a recipe: they
// exercise the calculator's display of the backend's answer.
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RequirementCalculator from './RequirementCalculator'
import { approvalActionState, buildRevisionLinesPayload, getRequirementPreview } from './formulasService'

vi.mock('./formulasService', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequirementPreview: vi.fn() }
})
vi.mock('../operations/batchPlansService', () => ({ getBatchPlanRequirementPreview: vi.fn() }))

// The server's shape: scale_factor is an exact-decimal object, as in the real response.
const exact = (value) => ({ value, is_exact: true, is_approximate: false, significant_digits: 4, rounding: null, is_whole_number: !value.includes('.') })

function preview(target, scale, lines, warnings = []) {
  return {
    revision: { base_output_quantity: '100.000', output_unit: { code: 'KG' } },
    target_output_quantity: target,
    scale_factor: exact(scale),
    lines,
    warnings,
    calculation_issues: [],
  }
}

function line(id, materialType, code, unit, base, value, exact = true) {
  return {
    id,
    line_number: id,
    material_type: materialType,
    material_code: code,
    material_name: `${code} name`,
    unit_code: unit,
    base_line_quantity: base,
    required_quantity: { value, is_exact: exact, is_approximate: !exact, is_whole_number: exact && !value.includes('.') },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('RequirementCalculator', () => {
  it('shows the backend quantities and scale factor for a target of 500', async () => {
    getRequirementPreview.mockResolvedValue(
      preview('500.000', '5', [
        line(1, 'RAW_MATERIAL', 'A', 'KG', '10.000', '50.000'),
        line(2, 'RAW_MATERIAL', 'B', 'KG', '5.000', '25.000'),
        line(3, 'RAW_MATERIAL', 'C', 'KG', '8.000', '40.000'),
        line(4, 'PACKAGING_MATERIAL', 'CAPS', 'PCS', '25.000', '125.000'),
      ])
    )
    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="500" />)
    fireEvent.click(screen.getByText('Calculate'))
    expect(await screen.findByText('50.000')).toBeTruthy()
    expect(screen.getByText('125.000')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(getRequirementPreview).toHaveBeenCalledWith(2, 1, 3, '500')
  })

  it('shows fractional COUNT warnings and approximate results without rounding', async () => {
    getRequirementPreview.mockResolvedValue(
      preview(
        '50.000',
        '0.5',
        [
          line(1, 'RAW_MATERIAL', 'A', 'KG', '10.000', '5.000'),
          line(4, 'PACKAGING_MATERIAL', 'CAPS', 'PCS', '25.000', '12.5'),
          line(5, 'RAW_MATERIAL', 'D', 'KG', '3.000', '1.333333', false),
        ],
        [{ code: 'FRACTIONAL_COUNT_REQUIREMENT', message: 'Not a whole number; shown unrounded.', line_id: 4, line_number: 4 }]
      )
    )
    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="50" />)
    fireEvent.click(screen.getByText('Calculate'))
    expect(await screen.findByText('12.5')).toBeTruthy()
    expect(screen.getByText('Not a whole number; shown unrounded.')).toBeTruthy()
    expect(screen.getByText('(approximate)', { exact: false })).toBeTruthy()
  })

  it('labels a draft preview as not saved', () => {
    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="50" />)
    expect(screen.getByText('Draft preview (not saved)')).toBeTruthy()
  })

  it('ignores the answer for an old target after the target changes', async () => {
    let resolveFirst
    getRequirementPreview
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(preview('500.000', '5', [line(1, 'RAW_MATERIAL', 'A', 'KG', '10.000', '50.000')]))

    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="50" />)
    fireEvent.click(screen.getByText('Calculate'))

    // The user changes the target while the first answer is still pending.
    fireEvent.change(screen.getByLabelText(/Target batch output/), { target: { value: '500' } })
    await act(async () => {
      resolveFirst(preview('50.000', '0.5', [line(1, 'RAW_MATERIAL', 'A', 'KG', '10.000', '5.000')]))
    })
    expect(screen.queryByText('5.000')).toBeNull()

    fireEvent.click(screen.getByText('Calculate'))
    await waitFor(() => expect(screen.getByText('50.000')).toBeTruthy())
  })

  it('does not crash when a line has no quantity yet (no required quantity from the server)', async () => {
    const incomplete = { ...line(6, 'RAW_MATERIAL', 'NEW', 'KG', '', ''), required_quantity: null }
    getRequirementPreview.mockResolvedValue(
      preview('50.000', '0.5', [line(1, 'RAW_MATERIAL', 'A', 'KG', '10.000', '5.000'), incomplete], [
        { code: 'QUANTITY_MISSING', message: 'Enter the base quantity for this line.', line_id: 6, line_number: 6 },
      ])
    )
    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="50" />)
    fireEvent.click(screen.getByText('Calculate'))
    expect(await screen.findByText('Enter the base quantity for this line.')).toBeTruthy()
    expect(screen.getByText('5.000')).toBeTruthy()
  })

  it('reports a failed request as an error, not as an empty result', async () => {
    getRequirementPreview.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403, data: { detail: 'You do not have formulas.view.' } } })
    )
    render(<RequirementCalculator companyId={2} formulaId={1} revisionId={3} initialTarget="50" />)
    fireEvent.click(screen.getByText('Calculate'))
    expect(await screen.findByText(/formulas\.view/)).toBeTruthy()
    expect(screen.queryByText('Raw materials')).toBeNull()
  })
})

describe('revision editor payload', () => {
  const allLines = [
    { id: 11, material_id: 100, material_type: 'RAW_MATERIAL', quantity: '10.000', notes: 'raw one' },
    { id: 12, material_id: 200, material_type: 'PACKAGING_MATERIAL', quantity: '25.000', notes: '' },
  ]

  it('keeps line ids, sends both tables together and leaves the other table unchanged', () => {
    const rows = [
      { id: 11, material: { id: 100 }, quantity: '12.000', notes: 'raw one' },
      { id: null, material: { id: 300 }, quantity: '5.000', notes: '' },
    ]
    const payload = buildRevisionLinesPayload({ allLines, kind: 'RAW_MATERIAL', rows })
    expect(payload).toEqual([
      { id: 12, material_id: 200, quantity: '25.000', notes: '' },
      {
        id: 11, material_id: 100, quantity: '12.000', notes: 'raw one',
        label_claim: '', special_value: '', ar_no: '', calculation_mode: 'AS_PER_FORMULA',
      },
      {
        material_id: 300, quantity: '5.000', notes: '',
        label_claim: '', special_value: '', ar_no: '', calculation_mode: 'AS_PER_FORMULA',
      },
    ])
  })

  it('sends label_claim_quantity/label_claim_uom_id only for an AS_PER_LABEL_CLAIM row, never for AS_PER_FORMULA', () => {
    const rows = [
      {
        id: 20, material: { id: 400 }, quantity: '1.000', notes: '',
        calculation_mode: 'AS_PER_LABEL_CLAIM', label_claim_quantity: '100', label_claim_uom: { id: 7 },
      },
      { id: 21, material: { id: 401 }, quantity: '2.000', notes: '', calculation_mode: 'AS_PER_FORMULA' },
    ]
    const payload = buildRevisionLinesPayload({ allLines: [], kind: 'PACKAGING_MATERIAL', rows })
    expect(payload[0]).toMatchObject({ calculation_mode: 'AS_PER_LABEL_CLAIM', label_claim_quantity: '100', label_claim_uom_id: 7 })
    expect(payload[1]).not.toHaveProperty('label_claim_quantity')
    expect(payload[1]).not.toHaveProperty('label_claim_uom_id')
  })
})

describe('approval gating', () => {
  const ready = { eligibility: { ready_to_attempt: true, actor_has_approve_permission: true, blocking_reasons: [] } }

  it('allows approval only with the permission and no blockers', () => {
    expect(approvalActionState(ready, true).canApprove).toBe(true)
  })

  it('refuses without the approval permission even when the policy is ready', () => {
    expect(approvalActionState(ready, false).canApprove).toBe(false)
    const noActorPermission = { eligibility: { ...ready.eligibility, actor_has_approve_permission: false } }
    expect(approvalActionState(noActorPermission, true).canApprove).toBe(false)
  })

  it('refuses when the backend reports a blocker', () => {
    const blocked = { eligibility: { ready_to_attempt: false, actor_has_approve_permission: true, blocking_reasons: ['self-approval'] } }
    expect(approvalActionState(blocked, true).canApprove).toBe(false)
  })

  it('does not allow approval before a check has been made', () => {
    expect(approvalActionState(null, true).canApprove).toBe(false)
  })
})
