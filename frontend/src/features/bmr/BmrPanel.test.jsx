// BMR panel: no-record state, creation, quantities from the backend, text
// entries saved with their version, and blank sign-off lines. Synthetic only.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BmrPanel from './BmrPanel'
import { createBmrForPlan, getBmrForPlan, updateBmrLine } from './bmrService'

vi.mock('./bmrService', () => ({
  getBmrForPlan: vi.fn(),
  createBmrForPlan: vi.fn(),
  updateBmrLine: vi.fn(),
}))

const RECORD = {
  id: 7,
  lines: [
    {
      id: 1, slip: 'RAW', line_number: 1, material_code: 'RAW1', material_name: 'Synthetic raw A', unit_code: 'KG',
      required_text: '5', special_value: '', display_required: '5', label_claim: '', ar_no: '', qty_received: '', version: 1,
    },
    {
      id: 2, slip: 'PACKING', line_number: 1, material_code: 'PKG1', material_name: 'Synthetic packing B', unit_code: 'PCS',
      required_text: '12.5', special_value: '', display_required: '12.5', label_claim: '', ar_no: '', qty_received: '', version: 1,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('BmrPanel', () => {
  it('shows the create action with no record yet, and does not show a fake empty record', async () => {
    getBmrForPlan.mockResolvedValue(null)
    render(<BmrPanel companyId={2} planId={9} canCreate />)
    expect(await screen.findByText('Create record')).toBeTruthy()
    expect(screen.queryByText('Raw material requisition slip')).toBeNull()
  })

  it('creates the record from the backend and shows the backend quantities', async () => {
    getBmrForPlan.mockResolvedValue(null)
    createBmrForPlan.mockResolvedValue(RECORD)
    render(<BmrPanel companyId={2} planId={9} canCreate />)
    fireEvent.click(await screen.findByText('Create record'))
    expect(createBmrForPlan).toHaveBeenCalledWith(2, 9)
    expect(await screen.findByText('Raw material requisition slip')).toBeTruthy()
    expect(screen.getByText('12.5')).toBeTruthy()
    expect(screen.getByText('Synthetic raw A')).toBeTruthy()
  })

  it('saves a Label Claim with the line version and the record id', async () => {
    getBmrForPlan.mockResolvedValue(RECORD)
    updateBmrLine.mockResolvedValue({ ...RECORD.lines[0], label_claim: '0.25 mL', version: 2 })
    render(<BmrPanel companyId={2} planId={9} canEdit />)
    const input = (await screen.findAllByLabelText('Label claim'))[0]
    fireEvent.change(input, { target: { value: '0.25 mL' } })
    fireEvent.blur(input)
    await waitFor(() => expect(updateBmrLine).toHaveBeenCalledTimes(1), { timeout: 4000 })
    expect(updateBmrLine).toHaveBeenCalledWith(2, 7, 1, { expected_version: 1, label_claim: '0.25 mL' })
  })

  it('renders sign-offs as blank lines, with no names filled in', async () => {
    getBmrForPlan.mockResolvedValue(RECORD)
    render(<BmrPanel companyId={2} planId={9} canEdit />)
    expect(await screen.findByText('Production Chemist')).toBeTruthy()
    expect(screen.getByText('QA Manager')).toBeTruthy()
    expect(screen.getAllByText('Signature').length).toBe(4)
  })
})
