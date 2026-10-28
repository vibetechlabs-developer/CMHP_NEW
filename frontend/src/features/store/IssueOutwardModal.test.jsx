// Focused tests for the real Issue Outward capture modal - Save Draft
// and Post Issue are two separate, explicit actions against the real
// stock_movements material-issue endpoints (mocked here).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IssueOutwardModal from './IssueOutwardModal'
import * as materialIssueService from './materialIssueService'
import { getStorePermissionCodes } from '../operations/storePreparationService'

vi.mock('./materialIssueService', () => ({
  createMaterialIssue: vi.fn(),
  updateMaterialIssue: vi.fn(),
  postMaterialIssue: vi.fn(),
  getAvailableToIssue: vi.fn(),
}))
vi.mock('../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(),
}))
vi.mock('../../components/ConfirmProvider', () => ({ confirmAction: vi.fn(async () => true) }))

const BALANCE = {
  unit_id: 2,
  unit_code: 'KG',
  unit_name: 'Kilogram',
  source_company_id: 7,
  source_company_code: 'CO1',
  recorded_receipt_quantity: '60.000',
  recorded_issued_quantity: '0.000',
  net_quantity: '60.000',
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  getStorePermissionCodes.mockResolvedValue(['stock_issue.post'])
})

describe('Issue Outward', () => {
  it('auto-selects the only source company with stock and shows what is available to issue, with a real unit label', async () => {
    materialIssueService.getAvailableToIssue.mockResolvedValue([BALANCE])
    render(
      <IssueOutwardModal storeId={5} materialId={10} materialCode="SYN-RAW-1" materialName="Synthetic raw A" onClose={() => {}} onIssued={() => {}} onPosted={() => {}} />
    )
    expect(await screen.findByText(/Available to issue:/)).toBeTruthy()
    expect(screen.getByText('60.000 KG')).toBeTruthy()
    expect(await screen.findByLabelText('Issued quantity (KG) *')).toBeTruthy()
  })

  it('saves a draft without posting, then posts it as a separate explicit action', async () => {
    materialIssueService.getAvailableToIssue.mockResolvedValue([BALANCE])
    materialIssueService.createMaterialIssue.mockResolvedValue({ id: 1, reference: 'MI-20261012-ABCDE', version: 1, status: 'DRAFT' })
    materialIssueService.postMaterialIssue.mockResolvedValue({ id: 1, reference: 'MI-20261012-ABCDE', status: 'POSTED', issued_quantity: '15.000', unit_code_snapshot: 'KG' })
    const onIssued = vi.fn()
    const onPosted = vi.fn()
    render(
      <IssueOutwardModal storeId={5} materialId={10} materialCode="SYN-RAW-1" onClose={() => {}} onIssued={onIssued} onPosted={onPosted} />
    )
    await screen.findByText(/Available to issue:/)
    fireEvent.change(screen.getByLabelText('Issued quantity (KG) *'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Name of product / formulation *'), { target: { value: 'Syrup Batch' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByText(/Draft MI-20261012-ABCDE saved/)
    expect(materialIssueService.createMaterialIssue).toHaveBeenCalledWith(5, expect.objectContaining({
      source_company_id: 7, material_id: 10, issued_quantity: '15', product_reference: 'Syrup Batch',
    }))
    expect(materialIssueService.postMaterialIssue).not.toHaveBeenCalled()
    expect(onIssued).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }))
    expect(onPosted).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Post Issue' }))
    await screen.findByText(/Issue MI-20261012-ABCDE posted/)
    expect(materialIssueService.postMaterialIssue).toHaveBeenCalledWith(5, 1, 1)
    expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ status: 'POSTED' }))
  })

  it('disables Post Issue above the recorded net balance, never silently clamping it, without blocking the draft save', async () => {
    materialIssueService.getAvailableToIssue.mockResolvedValue([BALANCE])
    materialIssueService.createMaterialIssue.mockResolvedValue({ id: 1, reference: 'MI-1', version: 1, status: 'DRAFT' })
    render(
      <IssueOutwardModal storeId={5} materialId={10} materialCode="SYN-RAW-1" onClose={() => {}} onIssued={() => {}} onPosted={() => {}} />
    )
    await screen.findByText(/Available to issue:/)
    fireEvent.change(screen.getByLabelText('Issued quantity (KG) *'), { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText('Name of product / formulation *'), { target: { value: 'Syrup Batch' } })
    expect(screen.getByText(/Exceeds the recorded net balance/)).toBeTruthy()
    // Save Draft is NOT gated by the balance - the backend itself only
    // enforces this cap at posting time, never at draft-save time.
    expect(screen.getByRole('button', { name: 'Save Draft' }).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByRole('button', { name: 'Post Issue' })
    expect(screen.getByRole('button', { name: 'Post Issue' }).disabled).toBe(true)
  })

  it('disables Post Issue when the caller does not hold stock_issue.post in this store', async () => {
    getStorePermissionCodes.mockResolvedValue([])
    materialIssueService.getAvailableToIssue.mockResolvedValue([BALANCE])
    materialIssueService.createMaterialIssue.mockResolvedValue({ id: 1, reference: 'MI-1', version: 1, status: 'DRAFT' })
    render(
      <IssueOutwardModal storeId={5} materialId={10} materialCode="SYN-RAW-1" onClose={() => {}} onIssued={() => {}} onPosted={() => {}} />
    )
    await screen.findByText(/Available to issue:/)
    fireEvent.change(screen.getByLabelText('Issued quantity (KG) *'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Name of product / formulation *'), { target: { value: 'Syrup Batch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    const postButton = await screen.findByRole('button', { name: 'Post Issue' })
    expect(postButton.disabled).toBe(true)
    expect(materialIssueService.postMaterialIssue).not.toHaveBeenCalled()
  })

  it('reports a draft that was created but failed to post, without claiming success', async () => {
    materialIssueService.getAvailableToIssue.mockResolvedValue([BALANCE])
    materialIssueService.createMaterialIssue.mockResolvedValue({ id: 1, reference: 'MI-20261012-ABCDE', version: 1, status: 'DRAFT' })
    materialIssueService.postMaterialIssue.mockRejectedValue({ response: { status: 400, headers: {}, data: { detail: 'would exceed the recorded net balance' } } })
    const onPosted = vi.fn()
    render(
      <IssueOutwardModal storeId={5} materialId={10} materialCode="SYN-RAW-1" onClose={() => {}} onIssued={() => {}} onPosted={onPosted} />
    )
    await screen.findByText(/Available to issue:/)
    fireEvent.change(screen.getByLabelText('Issued quantity (KG) *'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Name of product / formulation *'), { target: { value: 'Syrup Batch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Post Issue' }))

    expect(await screen.findByText(/remains a draft and was not counted as issued/)).toBeTruthy()
    expect(onPosted).not.toHaveBeenCalled()
  })
})
