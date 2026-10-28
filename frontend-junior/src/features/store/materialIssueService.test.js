// Proves the Outward workflow calls the real material-issue endpoints -
// available-to-issue lookup, draft create/update, explicit post, and the
// posted-movements read the register's Outward table uses. Synthetic
// data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '../../api/axios'
import {
  createMaterialIssue,
  getAvailableToIssue,
  listMaterialIssueMovements,
  listMaterialIssues,
  listMaterialReturns,
  postMaterialIssue,
  updateMaterialIssue,
} from './materialIssueService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAvailableToIssue', () => {
  it('requests the available endpoint scoped to the material', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getAvailableToIssue(3, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-issues/available/', { params: { material: 9 } })
  })
})

describe('createMaterialIssue', () => {
  it('posts the full create payload including idempotency_key', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'DRAFT', version: 1 } })
    const payload = {
      source_company_id: 2, material_id: 9, issued_quantity: '5', issued_at: '2026-04-01T10:00:00.000Z',
      batch_reference: '', product_reference: 'Tablet X', remarks: '', idempotency_key: 'k-1',
    }
    await createMaterialIssue(3, payload)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-issues/', payload)
  })
})

describe('updateMaterialIssue', () => {
  it('patches with expected_version', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, status: 'DRAFT', version: 2 } })
    await updateMaterialIssue(3, 1, { expected_version: 1, issued_quantity: '6' })
    expect(api.patch).toHaveBeenCalledWith('/v1/stores/3/material-issues/1/', { expected_version: 1, issued_quantity: '6' })
  })
})

describe('postMaterialIssue', () => {
  it('posts expected_version to the post action endpoint', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'POSTED', version: 2 } })
    await postMaterialIssue(3, 1, 1)
    expect(api.post).toHaveBeenCalledWith('/v1/stores/3/material-issues/1/post/', { expected_version: 1 })
  })
})

describe('listMaterialIssues', () => {
  it('sends only the filters that are actually set, using the exact backend param names', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listMaterialIssues(3, {
      status: 'DRAFT',
      material: 9,
      search: 'MI-2026',
      sourceCompanyId: 2,
      materialKind: 'RAW_MATERIAL',
      batchReference: 'GH01',
      productReference: 'Tablet X',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      page: 2,
      pageSize: 20,
    })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-issues/', {
      params: {
        status: 'DRAFT',
        material: 9,
        page: 2,
        page_size: 20,
        search: 'MI-2026',
        source_company_id: 2,
        material_kind: 'RAW_MATERIAL',
        batch_reference: 'GH01',
        product_reference: 'Tablet X',
        date_from: '2026-01-01',
        date_to: '2026-01-31',
      },
    })
  })

  it('omits unset filters entirely rather than sending empty strings', async () => {
    api.get.mockResolvedValue({ data: { count: 0, results: [] } })
    await listMaterialIssues(3, {})
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-issues/', { params: {} })
  })
})

describe('listMaterialReturns', () => {
  it('requests the store-scoped return list with only the filters set', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [{ id: 1 }] } })
    const result = await listMaterialReturns(3, { material: 9, returnType: 'UNUSED', page: 1, pageSize: 20 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-returns/', {
      params: { material: 9, return_type: 'UNUSED', page: 1, page_size: 20 },
    })
    expect(result).toEqual({ count: 1, results: [{ id: 1 }] })
  })
})

describe('listMaterialIssueMovements', () => {
  it('requests the store-scoped movement list with only the filters set, and maps coverage/period through', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [{ id: 1 }], coverage: { release_status: 'Not tracked' }, period: { posted_from: null, posted_to: null } } })
    const result = await listMaterialIssueMovements(3, { material: 9, page: 2, pageSize: 25 })
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/material-issue-movements/', { params: { page: 2, page_size: 25, material: 9 } })
    expect(result).toEqual({ count: 1, results: [{ id: 1 }], coverage: { release_status: 'Not tracked' }, period: { posted_from: null, posted_to: null } })
  })
})
