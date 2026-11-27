import { expect, it } from 'vitest'
import { formulaQaStatus } from './formulaQaStatus'

it.each([
  [{ status: 'SUBMITTED', product_name: 'Demo Antacid Suspension' }, 'PENDING'],
  [{ status: 'APPROVED' }, 'APPROVED'],
  [{ status: 'REJECTED' }, 'DECLINED'],
  [{ status: 'DRAFT', last_rejection_reason: 'Needs correction' }, 'DECLINED'],
  [{ status: 'DRAFT', last_rejection_reason: '' }, null],
])('uses the saved revision status for Formula QA', (revision, expected) => {
  expect(formulaQaStatus(revision)).toBe(expected)
})
