import api from '../../api/axios'
import { getScopedCompanyId } from '../../utils/companyScope'

const basePath = (companyId) => `/v1/companies/${companyId || getScopedCompanyId()}/documents`

export const documentsService = {
  // Summary counts
  getSummary: async (companyId) => {
    const res = await api.get(`${basePath(companyId)}/summary/`)
    return res.data
  },

  // Eligible batches for dropdowns
  getEligibleBatches: async (companyId) => {
    const res = await api.get(`${basePath(companyId)}/eligible-batches/`)
    return Array.isArray(res.data) ? res.data : res.data?.results || []
  },

  // BMR Documents
  listBmrDocuments: async (companyId, params = {}) => {
    const res = await api.get(`${basePath(companyId)}/bmr/`, { params })
    return res.data
  },

  uploadBmrDocument: async (companyId, formData) => {
    const res = await api.post(`${basePath(companyId)}/bmr/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  getBmrDetails: async (companyId, attachmentId) => {
    const res = await api.get(`${basePath(companyId)}/bmr/${attachmentId}/`)
    return res.data
  },

  getBmrVersions: async (companyId, attachmentId) => {
    const res = await api.get(`${basePath(companyId)}/bmr/${attachmentId}/versions/`)
    return Array.isArray(res.data) ? res.data : res.data?.results || []
  },

  downloadBmrFile: async (companyId, attachmentId, inline = false) => {
    const res = await api.get(`${basePath(companyId)}/bmr/${attachmentId}/download/`, {
      params: { inline },
      responseType: 'blob',
    })
    return res
  },

  // COA Documents
  listCoaDocuments: async (companyId, params = {}) => {
    const res = await api.get(`${basePath(companyId)}/coa/`, { params })
    return res.data
  },

  uploadCoaDocument: async (companyId, formData) => {
    const res = await api.post(`${basePath(companyId)}/coa/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  getCoaDetails: async (companyId, coaId) => {
    const res = await api.get(`${basePath(companyId)}/coa/${coaId}/`)
    return res.data
  },

  getCoaVersions: async (companyId, coaId) => {
    const res = await api.get(`${basePath(companyId)}/coa/${coaId}/versions/`)
    return Array.isArray(res.data) ? res.data : res.data?.results || []
  },

  downloadCoaFile: async (companyId, coaId, inline = false) => {
    const res = await api.get(`${basePath(companyId)}/coa/${coaId}/download/`, {
      params: { inline },
      responseType: 'blob',
    })
    return res
  },

  approveCoa: async (companyId, coaId, remarks = '') => {
    const res = await api.post(`${basePath(companyId)}/coa/${coaId}/approve/`, { remarks })
    return res.data
  },

  rejectCoa: async (companyId, coaId, reason) => {
    const res = await api.post(`${basePath(companyId)}/coa/${coaId}/reject/`, { reason })
    return res.data
  },
}

