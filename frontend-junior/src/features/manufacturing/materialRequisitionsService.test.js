// Proves the requisition lifecycle calls (create/submit/approve/reject/
// revise) hit the real store-scoped endpoints with the exact required
// fields, and that creating a requisition never itself calls a stock-
// affecting endpoint (requisitions only request materials - they never
// reserve, issue or consume stock). Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import {
  approveMaterialRequisition,
  createMaterialRequisition,
  getRequisitionStatus,
  listMaterialRequisitions,
  rejectMaterialRequisition,
  reviseMaterialRequisition,
  submitMaterialRequisition,
  updateMaterialRequisition,
} from './materialRequisitionsService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createMaterialRequisition', () => {
  it('sends batch_plan_id and expected_batch_plan_version - never client-supplied lines (server auto-fetches them)', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'DRAFT' } })
    await createMaterialRequisition(3, { batch_plan_id: 9, expected_batch_plan_version: 1, notes: 'x' })
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/', { batch_plan_id: 9, expected_batch_plan_version: 1, notes: 'x' })
  })

  it('never calls any stock-affecting endpoint - a requisition only requests, it never reserves/issues/consumes', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    await createMaterialRequisition(3, { batch_plan_id: 9, expected_batch_plan_version: 1 })
    const calledPaths = api.post.mock.calls.map(([path]) => path)
    expect(calledPaths.some((p) => p.includes('material-issues') || p.includes('goods-receipts') || p.includes('stock-movements'))).toBe(false)
  })
})

describe('lifecycle actions', () => {
  it('submit/approve post only expected_version to their own action endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'SUBMITTED' } })
    await submitMaterialRequisition(3, 1, 2)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/submit/', { expected_version: 2 })

    await approveMaterialRequisition(3, 1, 2)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/approve/', { expected_version: 2 })
  })

  it('reject requires a rejection_reason', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'REJECTED' } })
    await rejectMaterialRequisition(3, 1, 2, 'Quantities look wrong')
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/reject/', {
      expected_version: 2, rejection_reason: 'Quantities look wrong',
    })
  })

  it('revise posts expected_version, with optional refresh flags only when given', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'DRAFT' } })
    await reviseMaterialRequisition(3, 1, 2)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/revise/', { expected_version: 2 })

    await reviseMaterialRequisition(3, 1, 3, { refreshFromSource: true, expectedBatchPlanVersion: 5 })
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/revise/', {
      expected_version: 3, refresh_from_source: true, expected_batch_plan_version: 5,
    })
  })
})

describe('updateMaterialRequisition', () => {
  it('PATCHes only requested_quantity/quantity_remark per line - never adding or removing a line', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, version: 2 } })
    const payload = { expected_version: 1, lines: [{ id: 5, requested_quantity: '12.500', quantity_remark: 'Rounded up' }] }
    await updateMaterialRequisition(3, 1, payload)
    expect(api.patch).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/1/', payload)
  })
})

describe('listMaterialRequisitions / getRequisitionStatus', () => {
  it('lists are filterable by batch_plan, and status reads the narrower batch-plans-prefixed endpoint', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listMaterialRequisitions(3, { batchPlanId: 9 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-requisitions/', { params: { batch_plan: 9 } })

    api.get.mockResolvedValue({ data: { state: 'unavailable' } })
    const status = await getRequisitionStatus(3, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/batch-plans/9/requisition-status/')
    expect(status).toEqual({ state: 'unavailable' })
  })
})
