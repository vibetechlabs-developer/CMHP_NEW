import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IssueReturnTab from './IssueReturnTab'
import {
  listMaterialIssues,
  listProductionCustodies,
  listMaterialReturns,
  postMaterialIssue,
  cancelMaterialIssue,
} from '../../store/materialIssueService'
import { getMyStores, listMyCompanies } from '../../store/storeService'
import { listActiveMaterials } from '../purchasingService'
import { getStorePermissionCodes } from '../../operations/storePreparationService'

vi.mock('../../store/storeService', () => ({
  getMyStores: vi.fn(),
  listMyCompanies: vi.fn(),
  listContainerTypes: vi.fn(async () => []),
  listMaterialSuppliers: vi.fn(async () => []),
}))

vi.mock('../purchasingService', () => ({
  listActiveMaterials: vi.fn(async () => []),
}))

vi.mock('../../operations/storePreparationService', () => ({
  getStorePermissionCodes: vi.fn(async () => ['stock_issue.view', 'stock_issue.create', 'stock_issue.post']),
}))

vi.mock('../../manufacturing/batchPlansService', () => ({
  listBatchPlans: vi.fn(async () => ({ results: [] })),
}))

vi.mock('../../store/materialIssueService', () => ({
  listMaterialIssues: vi.fn(),
  getMaterialIssue: vi.fn(),
  createMaterialIssue: vi.fn(),
  updateMaterialIssue: vi.fn(),
  postMaterialIssue: vi.fn(),
  cancelMaterialIssue: vi.fn(),
  getAvailableToIssue: vi.fn(async () => []),
  listProductionCustodies: vi.fn(),
  listMaterialReturns: vi.fn(),
  recordProductionConsumption: vi.fn(),
  recordDefectClassification: vi.fn(),
  recordCustodyReturn: vi.fn(),
  recordCustodyDisposal: vi.fn(),
}))

const MOCK_ISSUES = [
  {
    id: 1,
    reference: 'MI-20260101-ABCDE',
    status: 'DRAFT',
    version: 1,
    issued_quantity: '30.000',
    unit_code_snapshot: 'KG',
    material_code_snapshot: 'RM-PARA',
    material_name_snapshot: 'Paracetamol Powder',
    material_kind: 'RAW_MATERIAL',
    source_company_id: 2,
    source_company_code: 'CMHP',
    batch_reference: 'GH2609',
    product_reference: 'Paracetamol Tablet',
    issued_at: '2026-01-10T10:00:00Z',
    created_by_id: 7,
  },
]

const MOCK_CUSTODIES = [
  {
    id: 50,
    source_issue_reference: 'MI-20260101-ABCDE',
    material_code: 'RM-PARA',
    material_name: 'Paracetamol Powder',
    source_company_code: 'CMHP',
    batch_reference: 'GH2609',
    product_reference: 'Paracetamol Tablet',
    unit_code: 'KG',
    issued_quantity: '30.000',
    consumed_quantity: '20.000',
    returned_quantity: '5.000',
    damaged_quantity: '0.000',
    disposed_quantity: '0.000',
    remaining_quantity: '5.000',
    sound_quantity: '5.000',
    version: 3,
    floor_events: [
      {
        id: 900, event_type: 'CONSUMPTION', quantity: '20.000', reason: '', disposal_policy: '',
        notes: '', recorded_by_id: 7, recorded_by_username: 'operator1', created_at: '2026-01-11T09:00:00Z',
      },
      {
        id: 901, event_type: 'RETURN_UNUSED', quantity: '5.000', reason: 'Unused Excess', disposal_policy: '',
        notes: '', recorded_by_id: 7, recorded_by_username: 'operator1', created_at: '2026-01-12T09:00:00Z',
      },
    ],
  },
]

const MOCK_RETURNS = [
  {
    id: 300,
    source_issue_reference: 'MI-20260101-ABCDE',
    source_company_code: 'CMHP',
    batch_reference: 'GH2609',
    material_code: 'RM-PARA',
    material_name: 'Paracetamol Powder',
    unit_code: 'KG',
    return_type: 'UNUSED',
    quantity: '5.000',
    disposition: 'HELD_UNASSESSED',
    recorded_by_id: 7,
    recorded_by_username: 'operator1',
    created_at: '2026-01-12T09:00:00Z',
  },
]

describe('IssueReturnTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyStores.mockResolvedValue([{ id: 1, name: 'Main Warehouse' }])
    listMyCompanies.mockResolvedValue([{ id: 2, code: 'CMHP', name: 'CMHP Lifesciences' }])
    getStorePermissionCodes.mockResolvedValue(['stock_issue.view', 'stock_issue.create', 'stock_issue.post'])
    listActiveMaterials.mockResolvedValue([{ id: 9, code: 'RM-PARA', name: 'Paracetamol Powder', kind: 'RAW_MATERIAL' }])
    listMaterialIssues.mockResolvedValue({ count: 1, results: MOCK_ISSUES })
    listProductionCustodies.mockResolvedValue(MOCK_CUSTODIES)
    listMaterialReturns.mockResolvedValue({ count: 1, results: MOCK_RETURNS })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders all four tabs and loads Material Issues by default', async () => {
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    expect(screen.getByText(/Material Issues/)).toBeTruthy()
    expect(screen.getByText(/Production Custody/)).toBeTruthy()
    expect(screen.getByText(/Returns/)).toBeTruthy()
    expect(screen.getByText(/Consumption & Disposition History/)).toBeTruthy()
    expect(screen.getByText('MI-20260101-ABCDE')).toBeTruthy()
    expect(screen.getByText('Issue & Return')).toBeTruthy()
  })

  it('switches to Production Custody tab and shows the real balance equation columns', async () => {
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText(/Production Custody/))
    })

    await waitFor(() => {
      expect(listProductionCustodies).toHaveBeenCalled()
    })
    expect(screen.getByText('MI-20260101-ABCDE')).toBeTruthy()
    expect(screen.getAllByText(/5\.000/).length).toBeGreaterThan(0)
  })

  it('switches to Returns tab and shows disposition as HELD_UNASSESSED, never auto-released', async () => {
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText(/^↩️ Returns/))
    })

    await waitFor(() => {
      expect(screen.getByText('RET-300')).toBeTruthy()
    })
    expect(screen.getByText('HELD UNASSESSED')).toBeTruthy()
  })

  it('derives Consumption & Disposition History from already-loaded custody floor_events, with no extra API call', async () => {
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText(/Consumption & Disposition History/))
    })

    await waitFor(() => {
      expect(listProductionCustodies).toHaveBeenCalledTimes(1)
    })
    expect(screen.getAllByText('Actual Consumption').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Return (Unused)').length).toBeGreaterThan(0)
  })

  it('posts a draft issue only after the themed confirm dialog is accepted, then refreshes the list', async () => {
    postMaterialIssue.mockResolvedValue({ ...MOCK_ISSUES[0], status: 'POSTED', version: 2 })
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    const postBtn = screen.getByRole('button', { name: 'Post Issue' })
    await act(async () => {
      fireEvent.click(postBtn)
    })
    expect(postMaterialIssue).not.toHaveBeenCalled() // confirm dialog not yet accepted

    const confirmBtn = document.getElementById('cd-btn-confirm')
    await act(async () => {
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(postMaterialIssue).toHaveBeenCalledWith(1, 1, 1)
    })
    expect(listMaterialIssues).toHaveBeenCalledTimes(2) // initial load + post-action refresh
  })

  it('cancels a draft issue only after a reason is provided in the themed prompt dialog', async () => {
    cancelMaterialIssue.mockResolvedValue({ ...MOCK_ISSUES[0], status: 'CANCELLED', version: 2 })
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    await act(async () => {
      fireEvent.click(cancelBtn)
    })

    const promptInput = document.querySelector('.cd-input')
    await act(async () => {
      fireEvent.change(promptInput, { target: { value: 'Entered incorrectly' } })
    })
    const confirmBtn = document.getElementById('cd-btn-prompt-confirm')
    await act(async () => {
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(cancelMaterialIssue).toHaveBeenCalledWith(1, 1, 1, 'Entered incorrectly')
    })
  })

  it('disables custody action buttons when the caller lacks stock_issue.post, with an explanatory tooltip', async () => {
    getStorePermissionCodes.mockResolvedValue(['stock_issue.view'])
    await act(async () => {
      render(<IssueReturnTab storeId={1} />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText(/Production Custody/))
    })

    await waitFor(() => {
      expect(listProductionCustodies).toHaveBeenCalled()
    })

    const consumeBtn = await screen.findByRole('button', { name: 'Log Consumed' })
    expect(consumeBtn.disabled).toBe(true)
    expect(consumeBtn.title).toContain('stock_issue.post')
  })
})
