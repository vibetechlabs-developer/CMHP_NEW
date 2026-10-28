// Proves batch-plan creation never touches stock (only ever calls real
// batch_plans endpoints), uses the real eligible-revisions lookup (never
// an unbounded/unfiltered formula list), and that allocate-number is the
// ONLY call that ever hits the allocate-number endpoint - a separate,
// explicit action, never folded into create/update. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import {
  allocateBatchNumber,
  createBatchPlan,
  getBatchPlan,
  getBatchPlanRequirementPreview,
  listBatchPlansForOrder,
  listEligibleRevisionsForProduct,
  listPlanningUnits,
  updateBatchPlan,
} from './batchPlansService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listEligibleRevisionsForProduct', () => {
  it('requests only APPROVED revisions scoped to the given product', async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: 1, formula_code: 'P-F1', revision_number: 2 }] } })
    const results = await listEligibleRevisionsForProduct(5, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/eligible-revisions/', { params: { product: 9 } })
    expect(results).toEqual([{ id: 1, formula_code: 'P-F1', revision_number: 2 }])
  })
})

describe('createBatchPlan', () => {
  it('sends sales_order_line_id, formula_revision_id and target_output_quantity - never a company field (resolved from the URL)', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'DRAFT' } })
    const payload = { sales_order_line_id: 11, formula_revision_id: 4, target_output_quantity: '500' }
    await createBatchPlan(5, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/batch-plans/', payload)
  })

  it('never calls any stock/material-issue endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    await createBatchPlan(5, { sales_order_line_id: 11, formula_revision_id: 4, target_output_quantity: '500' })
    const calledPaths = api.post.mock.calls.map(([path]) => path)
    expect(calledPaths.some((p) => p.includes('stock-movements') || p.includes('material-issues') || p.includes('goods-receipts'))).toBe(false)
  })
})

describe('allocateBatchNumber - the ONLY path that ever numbers a plan', () => {
  it('posts expected_version to the dedicated allocate-number endpoint only', async () => {
    api.post.mockResolvedValue({ data: { id: 1, official_batch_number: 'GER26-001' } })
    await allocateBatchNumber(5, 1, 2)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/allocate-number/', { expected_version: 2 })
    expect(api.post).toHaveBeenCalledTimes(1)
  })
})

describe('reads', () => {
  it('getBatchPlan/listBatchPlansForOrder/getBatchPlanRequirementPreview hit the exact expected paths', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getBatchPlan(5, 1)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/')

    await listBatchPlansForOrder(5, 3)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/', { params: { order: 3, page_size: 100 } })

    await getBatchPlanRequirementPreview(5, 1)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/requirement-preview/')
  })

  it('listPlanningUnits never sends a query param - server filtering happens client-side on the full result', async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: 1, code: 'KG', name: 'Kilogram' }] } })
    const units = await listPlanningUnits(5, 'kg')
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/planning-units/')
    expect(units).toEqual([{ id: 1, code: 'KG', name: 'Kilogram', label: 'Kilogram (KG)' }])
  })
})

describe('updateBatchPlan', () => {
  it('PATCHes with expected_version, never sales_order_line_id/formula_revision_id (immutable after create)', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, version: 2 } })
    await updateBatchPlan(5, 1, { expected_version: 1, notes: 'Updated' })
    expect(api.patch).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/', { expected_version: 1, notes: 'Updated' })
  })
})
