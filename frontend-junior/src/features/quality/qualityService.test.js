import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('../../utils/audit', () => ({
  recordAudit: vi.fn(),
}))

import api from '../../api/axios'
import { qualityService } from './qualityService'
import { qaPipelineService } from './qaPipelineService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('qualityService backend integration', () => {
  it('getBatches syncs and overlays authoritative PostgreSQL BatchQualityCase statuses', async () => {
    const mockCases = [
      {
        id: 42,
        company_id: 2,
        batch_plan_id: 101,
        batch_number_snapshot: 'BAT-2026-001',
        product_name_snapshot: 'Amoxicillin 500mg',
        product_code_snapshot: 'AMX-500',
        stage_status: 'QC_APPROVED',
        qc_status: 'APPROVED',
        qa_release_status: 'PENDING',
        coa_status: 'PENDING',
        packaging_qa_status: 'PENDING',
        packaging_complete: false,
        version: 3,
      },
    ]

    api.get.mockResolvedValueOnce({ data: { results: mockCases } })

    const batches = await qualityService.getBatches(2)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/2/batch-quality/', { params: {} })

    const found = batches.find((b) => b.number === 'BAT-2026-001' || b.quality_case_id === 42)
    expect(found).toBeDefined()
    expect(found.qc_status).toBe('APPROVED')
    expect(found.qa_status).toBe('PENDING')
    expect(found.quality_case_id).toBe(42)
    expect(found.version).toBe(3)
  })

  it('qcDecision calls PostgreSQL backend and throws error if backend rejects', async () => {
    // Mock listCases returning case
    api.get.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: 42,
            company_id: 2,
            batch_plan_id: 101,
            batch_number_snapshot: 'BAT-2026-001',
            version: 1,
          },
        ],
      },
    })
    // Mock recordQcDecision failing with 403 Forbidden
    api.post.mockRejectedValueOnce(new Error('Permission denied: batch_quality.qc_decide required.'))

    await expect(
      qualityService.qcDecision(101, { decision: 'APPROVE', remarks: 'Passed all lab specs' }, 2)
    ).rejects.toThrow('Permission denied')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/companies/2/batch-quality/42/qc-decisions/',
      expect.objectContaining({
        expected_version: 1,
        outcome: 'APPROVED',
        remarks: 'Passed all lab specs',
      })
    )
  })

  it('qaDecision calls PostgreSQL backend and throws error if QC is not approved', async () => {
    // Mock getCase returning case with PENDING QC
    api.get.mockResolvedValueOnce({
      data: {
        id: 42,
        company_id: 2,
        batch_plan_id: 101,
        batch_number_snapshot: 'BAT-2026-001',
        qc_status: 'PENDING',
        version: 1,
      },
    })
    // Mock recordQaRelease failing with validation error
    api.post.mockRejectedValueOnce(
      new Error('QA release is allowed only when the latest Batch QC decision is APPROVED.')
    )

    await expect(
      qualityService.qaDecision(42, { decision: 'RELEASE', remarks: 'Release batch' }, 2)
    ).rejects.toThrow('QA release is allowed only when the latest Batch QC decision is APPROVED.')

    expect(api.post).toHaveBeenCalledWith(
      '/v1/companies/2/batch-quality/42/qa-release/',
      expect.objectContaining({
        expected_version: 1,
        outcome: 'APPROVED',
        remarks: 'Release batch',
      })
    )
  })

  it('getBatchTraceability retrieves immutable decision history from backend case', async () => {
    const mockCase = {
      id: 42,
      company_id: 2,
      batch_plan_id: 101,
      batch_number_snapshot: 'BAT-2026-001',
      decisions: [
        {
          id: 1,
          decision_type: 'BATCH_QC',
          outcome: 'APPROVED',
          decided_by_name: 'Dr. Analyst',
          decided_at: '2026-11-12T10:00:00Z',
          remarks: 'Microbiology tests clear',
        },
        {
          id: 2,
          decision_type: 'QA_RELEASE',
          outcome: 'APPROVED',
          decided_by_name: 'Chief QA Officer',
          decided_at: '2026-11-12T11:00:00Z',
          remarks: 'BMR reviewed, release authorized',
        },
      ],
    }

    // First call: listCases
    api.get.mockResolvedValueOnce({ data: { results: [mockCase] } })
    // Second call: getCase detail
    api.get.mockResolvedValueOnce({ data: mockCase })

    const trace = await qualityService.getBatchTraceability(101, 2)
    expect(trace.qc_history).toHaveLength(1)
    expect(trace.qc_history[0].decision).toBe('APPROVED')
    expect(trace.qc_history[0].by).toBe('Dr. Analyst')
    expect(trace.qc_history[0].remarks).toBe('Microbiology tests clear')

    expect(trace.qa_history).toHaveLength(1)
    expect(trace.qa_history[0].decision).toBe('QA_RELEASE: APPROVED')
    expect(trace.qa_history[0].by).toBe('Chief QA Officer')
  })
})

