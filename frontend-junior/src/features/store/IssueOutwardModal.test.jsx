// Isolated, mocked-contract tests for the Issue Outward modal: available-
// to-issue loading/auto-select, draft create/post, the exceeds-available
// guard, permission-gated posting, and error handling. Synthetic data only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IssueOutwardModal from './IssueOutwardModal'
import { createMaterialIssue, getAvailableToIssue, postMaterialIssue } from './materialIssueService'
import { getStorePermissionCodes } from '../operations/storePreparationService'

vi.mock('./materialIssueService', () => ({
  getAvailableToIssue: vi.fn(),
  createMaterialIssue: vi.fn(),
  updateMaterialIssue: vi.fn(),
  postMaterialIssue: vi.fn(),
}))
vi.mock('../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(async () => []),
}))
vi.mock('../manufacturing/batchPlansService', () => ({
  listBatchPlans: vi.fn(async () => ({ results: [] })),
}))

const ONE_BALANCE = [{ source_company_id: 2, source_company_code: 'CMHP', unit_code: 'KG', net_quantity: '50.000', recorded_receipt_quantity: '60.000', recorded_issued_quantity: '10.000' }]

beforeEach(() => {
  vi.clearAllMocks()
  getAvailableToIssue.mockResolvedValue(ONE_BALANCE)
})

afterEach(() => {
  cleanup()
})

describe('available-to-issue loading', () => {
  it('requests the real available-to-issue endpoint and auto-selects the only company with stock', async () => {
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(getAvailableToIssue).toHaveBeenCalledWith(3, '9'))
    await waitFor(() => expect(screen.getByText(/Available to issue/)).toBeTruthy())
    expect(screen.getAllByText(/50\.000 KG/).length).toBeGreaterThan(0)
  })
})

describe('draft create and post', () => {
  it('creates a draft with the real company/material ids and the entered quantity', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })

    await waitFor(() => expect(createMaterialIssue).toHaveBeenCalledTimes(1))
    const [storeId, payload] = createMaterialIssue.mock.calls[0]
    expect(storeId).toBe(3)
    expect(payload.source_company_id).toBe(2)
    expect(payload.material_id).toBe(9)
    expect(payload.issued_quantity).toBe('20')
    expect(payload.product_reference).toBe('Tablet X')
  })

  it('blocks posting when the quantity exceeds the recorded net balance, and explains why', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    getStorePermissionCodes.mockResolvedValue(['stock_issue.post'])
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })

    await waitFor(() => expect(screen.getByText('Post Issue')).toBeTruthy())
    expect(screen.getByText('Post Issue').disabled).toBe(true)
    expect(screen.getByText(/Exceeds the recorded net balance of 50/)).toBeTruthy()
  })

  it('posts the draft with its id and version after confirmation, and surfaces onPosted', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    postMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'POSTED', version: 2, issued_quantity: '20', product_reference: 'Tablet X' })
    getStorePermissionCodes.mockResolvedValue(['stock_issue.post'])
    const onPosted = vi.fn()
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onPosted={onPosted} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(screen.getByText('Post Issue')).toBeTruthy())

    // Click Post Issue — this opens the themed ConfirmDialog
    await act(async () => { screen.getByText('Post Issue').click() })

    // Click the confirm button inside the themed ConfirmDialog
    await waitFor(() => expect(screen.getByText(/Post Issue/i, { selector: '.cd-btn--danger' })).toBeTruthy())
    await act(async () => { screen.getByText(/Post Issue/i, { selector: '.cd-btn--danger' }).click() })

    await waitFor(() => expect(postMaterialIssue).toHaveBeenCalledWith(3, 1, 1))
    expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'POSTED' }))
  })

  it('does not post when the user declines the confirmation', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    getStorePermissionCodes.mockResolvedValue(['stock_issue.post'])
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(screen.getByText('Post Issue')).toBeTruthy())

    // Click Post Issue — this opens the themed ConfirmDialog
    await act(async () => { screen.getByText('Post Issue').click() })

    // Click "Go Back" (cancel) in the themed ConfirmDialog
    await waitFor(() => expect(screen.getByText('Go Back')).toBeTruthy())
    await act(async () => { screen.getByText('Go Back').click() })

    expect(postMaterialIssue).not.toHaveBeenCalled()
  })

  it('posts directly via one-click Issue & Post to Ledger', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    postMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'POSTED', version: 2, issued_quantity: '15', product_reference: 'Syrup A' })
    const onPosted = vi.fn()
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} onPosted={onPosted} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Syrup A' } })

    const issueAndPostBtn = screen.getByText(/Issue & Post to Ledger/)
    expect(issueAndPostBtn).toBeTruthy()
    expect(issueAndPostBtn.disabled).toBe(false)

    await act(async () => { issueAndPostBtn.click() })

    await waitFor(() => expect(createMaterialIssue).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(postMaterialIssue).toHaveBeenCalledWith(3, 1, 1))
    expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'POSTED' }))
  })
})

describe('error handling', () => {
  it('shows the server error on a failed draft save and allows retry', async () => {
    createMaterialIssue.mockRejectedValueOnce({ response: { status: 400 }, message: 'Invalid issue' })
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })

    await waitFor(() => expect(screen.getByText(/Invalid issue/)).toBeTruthy())

    createMaterialIssue.mockResolvedValueOnce({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(createMaterialIssue).toHaveBeenCalledTimes(2))
  })

  it('a failed post leaves the draft intact and reports the failure without claiming success', async () => {
    createMaterialIssue.mockResolvedValue({ id: 1, reference: 'ISS-0001', status: 'DRAFT', version: 1 })
    postMaterialIssue.mockRejectedValueOnce({ response: { status: 409 }, message: 'Stale version' })
    getStorePermissionCodes.mockResolvedValue(['stock_issue.post'])
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/Issued quantity/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText(/Issued quantity/), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/Name of product/), { target: { value: 'Tablet X' } })
    await act(async () => { screen.getByText('Save Draft').click() })
    await waitFor(() => expect(screen.getByText('Post Issue')).toBeTruthy())

    // Click Post Issue — opens the themed ConfirmDialog
    await act(async () => { screen.getByText('Post Issue').click() })

    // Confirm inside the themed dialog
    await waitFor(() => expect(screen.getByText(/Post Issue/i, { selector: '.cd-btn--danger' })).toBeTruthy())
    await act(async () => { screen.getByText(/Post Issue/i, { selector: '.cd-btn--danger' }).click() })

    await waitFor(() => expect(screen.getByText(/could not be posted/)).toBeTruthy())
    expect(screen.queryByText(/posted\. The register now reflects/)).toBeNull()
  })

  it('derives product reference consistently when an existing batch is chosen', async () => {
    const { listBatchPlans } = await import('../manufacturing/batchPlansService')
    listBatchPlans.mockResolvedValueOnce({
      results: [{ id: 44, official_batch_number: 'GH2609', product_name: 'Paracetamol 500mg Tablets' }],
    })
    render(<IssueOutwardModal storeId={3} materialId={9} materialCode="SYNTH-9" materialName="Synthetic" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText(/batch no/i)).toBeTruthy())
    await waitFor(() => expect(listBatchPlans).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/batch no/i), { target: { value: 'GH2609' } })
    await waitFor(() => expect(screen.getByLabelText(/Name of product/).value).toBe('Paracetamol 500mg Tablets'))
  })
})
