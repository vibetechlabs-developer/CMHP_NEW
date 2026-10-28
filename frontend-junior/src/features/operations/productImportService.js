// Existing product import flow (apps.product_imports): upload a CSV for a
// preview, review its rows, then commit that exact preview. Nothing is created
// until the commit call succeeds.
import api from '../../api/axios'

export async function previewProductImport(companyId, file) {
  const body = new FormData()
  body.append('file', file)
  const response = await api.post(`/v1/companies/${companyId}/products/import-preview/`, body, {
    headers: { 'Content-Type': undefined },
  })
  return response.data
}

export async function commitProductImport(companyId, previewId, expectedVersion) {
  const response = await api.post(`/v1/companies/${companyId}/products/import-commit/`, {
    preview_id: previewId,
    expected_version: expectedVersion,
  })
  return response.data
}
