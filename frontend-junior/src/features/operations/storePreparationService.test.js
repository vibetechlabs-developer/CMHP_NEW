// Requisition status wording for the order's store block. Absent, hidden in
// another store and hidden in a deactivated store must all read the same, and
// must never be described as "no requisition created". Synthetic data only.
import { describe, expect, it } from 'vitest'

import { requisitionStatusText } from './storePreparationService'

describe('requisitionStatusText', () => {
  it('shows the neutral unavailable wording for an unavailable answer', () => {
    expect(requisitionStatusText({ state: 'unavailable', row: null })).toBe('Requisition status unavailable')
  })

  it('shows the same neutral wording when nothing has been loaded yet', () => {
    expect(requisitionStatusText(null)).toBe('Requisition status unavailable')
  })

  it('never translates unavailable into "no requisition" wording', () => {
    const text = requisitionStatusText({ state: 'unavailable', row: null })
    expect(text).not.toMatch(/no requisition/i)
    expect(text).not.toMatch(/not created/i)
  })

  it('shows the readable workflow status label for a visible requisition', () => {
    expect(requisitionStatusText({ state: 'present', row: { status: 'DRAFT', status_label: 'Draft' } })).toBe('Draft')
  })

  it('reports a failed load as a load failure, not as an unavailable record', () => {
    expect(requisitionStatusText({ state: 'error', row: null })).toBe('Could not load')
  })
})
