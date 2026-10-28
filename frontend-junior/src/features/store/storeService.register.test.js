// Proves getMaterialRegister hits the real, dedicated register endpoint
// with the correct store/material/filter/pagination params, and maps the
// server's field names (period_received, closing_net_of_issues, ...)
// faithfully - never fabricating or renaming a figure. Synthetic data only.
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}))

import api from '../../api/axios'
import { getMaterialRegister } from './storeService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getMaterialRegister', () => {
  it('requests the correct store+material-scoped endpoint with only the filters actually set', async () => {
    api.get.mockResolvedValue({
      data: {
        material: { id: 9, code: 'SYNTH-9' }, store_id: 3, store_code: 'WH1',
        opening: [], period_received: [], closing: [], period_issued: [], closing_net_of_issues: [],
        results: [], count: 0, coverage: { notice: 'x', release_status: 'Not tracked' },
        period: { posted_from: '2026-04-01', posted_to: null },
      },
    })

    await getMaterialRegister(3, 9, { postedFrom: '2026-04-01', search: 'INV-1', page: 2, pageSize: 25 })

    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/materials/9/register/', {
      params: { page: 2, page_size: 25, posted_from: '2026-04-01', search: 'INV-1' },
    })
  })

  it('maps opening/period_received/closing/period_issued/closing_net_of_issues without renaming or merging them', async () => {
    api.get.mockResolvedValue({
      data: {
        material: { id: 9 }, store_id: 3, store_code: 'WH1',
        opening: [{ unit_id: 1, source_company_id: 1, recorded_receipt_quantity: '10.000', unit_code: 'KG', source_company_code: 'CMHP' }],
        period_received: [{ unit_id: 1, source_company_id: 1, recorded_receipt_quantity: '5.000', unit_code: 'KG', source_company_code: 'CMHP' }],
        closing: [{ unit_id: 1, source_company_id: 1, recorded_receipt_quantity: '15.000', unit_code: 'KG', source_company_code: 'CMHP' }],
        period_issued: [{ unit_id: 1, source_company_id: 1, recorded_issued_quantity: '2.000', unit_code: 'KG', source_company_code: 'CMHP' }],
        closing_net_of_issues: [{ unit_id: 1, source_company_id: 1, net_quantity: '13.000', unit_code: 'KG', source_company_code: 'CMHP' }],
        results: [{ id: 1, quantity: '5.000' }], count: 1,
        coverage: { notice: 'receipt-only', release_status: 'Not tracked' },
        period: { posted_from: null, posted_to: null },
      },
    })

    const result = await getMaterialRegister(3, 9)

    expect(result.opening[0].recorded_receipt_quantity).toBe('10.000')
    expect(result.periodReceived[0].recorded_receipt_quantity).toBe('5.000')
    expect(result.closing[0].recorded_receipt_quantity).toBe('15.000')
    expect(result.periodIssued[0].recorded_issued_quantity).toBe('2.000')
    expect(result.closingNetOfIssues[0].net_quantity).toBe('13.000')
    expect(result.movements).toEqual([{ id: 1, quantity: '5.000' }])
    expect(result.count).toBe(1)
    expect(result.coverage.release_status).toBe('Not tracked')
  })

  it('omits posted_from/posted_to/search/supplier entirely when not given, rather than sending empty strings', async () => {
    api.get.mockResolvedValue({ data: { results: [], count: 0 } })
    await getMaterialRegister(3, 9)
    expect(api.get).toHaveBeenCalledWith('/v1/stores/3/materials/9/register/', { params: { page: 1, page_size: 25 } })
  })
})
