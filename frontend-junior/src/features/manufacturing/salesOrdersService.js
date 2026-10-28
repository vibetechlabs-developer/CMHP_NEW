// Real apps.sales_orders - READ ONLY here. This app does not build Sales
// Order creation/editing/confirmation (that is its own, separate scope);
// these two reads exist only to let Batch Planning pick a real, existing
// sales_order_line_id, which apps.batch_plans.BatchPlanCreateSerializer
// requires and never makes optional. Endpoint paths verified against the
// current apps/sales_orders/urls.py.
import api from '../../api/axios'

const base = (companyId) => `/v1/companies/${companyId}/sales-orders`

export async function listSalesOrders(companyId, { search, page, pageSize } = {}) {
  const params = {}
  if (search) params.search = search
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  const response = await api.get(`${base(companyId)}/`, { params })
  return response.data
}

// Includes the order's own `lines` (SalesOrderLineSerializer), each with
// a real id usable as sales_order_line_id in createBatchPlan.
export async function getSalesOrder(companyId, orderId) {
  const response = await api.get(`${base(companyId)}/${orderId}/`)
  return response.data
}
