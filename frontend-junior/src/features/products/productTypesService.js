// Shared product-type lookup maintained in the backend (GET /v1/product-
// types/, apps.catalog). Ported from frontend/src/features/operations/
// productTypesService.js. Nothing here is hardcoded; an unavailable
// lookup returns an error to the caller.
import api from '../../api/axios'

export async function listProductTypes() {
  const response = await api.get('/v1/product-types/', {
    params: { is_active: true, page_size: 100 },
  })
  return response.data.results || []
}
