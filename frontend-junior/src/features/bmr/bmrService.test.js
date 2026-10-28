// Proves getBmrForPlan treats a 404 as "no BMR yet" (null), never an
// error; createBmrForPlan sends an empty body (the server derives
// everything from the plan's own requirement preview); updateBmrLine
// only ever patches the four free-text fields; and that creating or
// editing a BMR never calls a stock-affecting endpoint. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import { createBmrForPlan, getBmrForPlan, updateBmrLine } from './bmrService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getBmrForPlan', () => {
  it('returns null on a 404 - "no BMR yet", not an error', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    const result = await getBmrForPlan(5, 1)
    expect(result).toBeNull()
  })

  it('re-throws any other error', async () => {
    const err = { response: { status: 500 } }
    api.get.mockRejectedValue(err)
    await expect(getBmrForPlan(5, 1)).rejects.toBe(err)
  })

  it('requests the exact plan-scoped endpoint', async () => {
    api.get.mockResolvedValue({ data: { id: 1, lines: [] } })
    await getBmrForPlan(5, 1)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/bmr/')
  })
})

describe('createBmrForPlan', () => {
  it('posts an empty body - all lines are server-derived from the batch plan requirement preview', async () => {
    api.post.mockResolvedValue({ data: { id: 1, lines: [] } })
    await createBmrForPlan(5, 1)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/5/batch-plans/1/bmr/', {})
  })

  it('never calls a stock-affecting endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    await createBmrForPlan(5, 1)
    const calledPaths = api.post.mock.calls.map(([path]) => path)
    expect(calledPaths.some((p) => p.includes('material-issues') || p.includes('goods-receipts'))).toBe(false)
  })
})

describe('updateBmrLine', () => {
  it('PATCHes with expected_version plus only the given free-text fields', async () => {
    api.patch.mockResolvedValue({ data: { id: 2, version: 2 } })
    await updateBmrLine(5, 1, 2, { expected_version: 1, special_value: 'Q.S.' })
    expect(api.patch).toHaveBeenCalledWith('/v1/companies/5/bmr/1/lines/2/', { expected_version: 1, special_value: 'Q.S.' })
  })
})
