// Real, server-side search lookups for the customer/product pickers used
// by the sales order form. Each option carries the codes the form derives
// read-only fields from (customer code, product code/type/sales unit).
import api from '../../api/axios'

const SEARCH_PAGE_SIZE = 20

export async function searchCustomers(realCompanyId, term) {
  if (!realCompanyId) return []
  const response = await api.get(`/v1/companies/${realCompanyId}/customers/`, {
    params: { search: term || undefined, page_size: SEARCH_PAGE_SIZE, is_active: true },
  })
  return (response.data.results || []).map((customer) => ({
    id: customer.id,
    label: customer.name,
    code: customer.code,
    meta: customer.code,
  }))
}

export async function searchProducts(realCompanyId, term) {
  if (!realCompanyId) return []
  const response = await api.get(`/v1/companies/${realCompanyId}/products/`, {
    params: { search: term || undefined, page_size: SEARCH_PAGE_SIZE, is_active: true },
  })
  return (response.data.results || []).map((product) => ({
    id: product.id,
    label: product.name,
    code: product.code,
    productType: product.product_type || '',
    salesUomCode: product.sales_uom_code,
    meta: `${product.code} · ${product.product_type || 'no type'} · ${product.sales_uom_code}`,
  }))
}
