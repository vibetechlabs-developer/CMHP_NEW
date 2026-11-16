import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../api/axios'
import { documentsService } from './documentsService'

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('documentsService', () => {
  const companyId = 42

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getSummary calls the summary endpoint with scoped company', async () => {
    api.get.mockResolvedValueOnce({ data: { bmr: { total_batches: 5 }, coa: { approved_coas: 3 } } })
    const res = await documentsService.getSummary(companyId)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/42/documents/summary/')
    expect(res.bmr.total_batches).toBe(5)
  })

  it('getEligibleBatches returns array of batches', async () => {
    api.get.mockResolvedValueOnce({ data: [{ batch_plan_id: 1, batch_number: 'B001' }] })
    const res = await documentsService.getEligibleBatches(companyId)
    expect(api.get).toHaveBeenCalledWith('/v1/companies/42/documents/eligible-batches/')
    expect(res).toHaveLength(1)
    expect(res[0].batch_number).toBe('B001')
  })

  it('uploadBmrDocument sends multipart data to /bmr/', async () => {
    const formData = new FormData()
    formData.append('document_name', 'BMR Spec')
    api.post.mockResolvedValueOnce({ data: { id: 10, document_name: 'BMR Spec' } })

    const res = await documentsService.uploadBmrDocument(companyId, formData)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/42/documents/bmr/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    expect(res.id).toBe(10)
  })

  it('uploadCoaDocument sends multipart data to /coa/', async () => {
    const formData = new FormData()
    formData.append('coa_number', 'COA-2026-01')
    api.post.mockResolvedValueOnce({ data: { id: 20, status: 'PENDING_APPROVAL' } })

    const res = await documentsService.uploadCoaDocument(companyId, formData)
    expect(api.post).toHaveBeenCalledWith('/v1/companies/42/documents/coa/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    expect(res.status).toBe('PENDING_APPROVAL')
  })

  it('approveCoa sends approval POST', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 20, status: 'APPROVED' } })
    const res = await documentsService.approveCoa(companyId, 20, 'Looks good')
    expect(api.post).toHaveBeenCalledWith('/v1/companies/42/documents/coa/20/approve/', { remarks: 'Looks good' })
    expect(res.status).toBe('APPROVED')
  })

  it('rejectCoa sends rejection POST with reason', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 20, status: 'REJECTED' } })
    const res = await documentsService.rejectCoa(companyId, 20, 'Failed assay')
    expect(api.post).toHaveBeenCalledWith('/v1/companies/42/documents/coa/20/reject/', { reason: 'Failed assay' })
    expect(res.status).toBe('REJECTED')
  })
})

