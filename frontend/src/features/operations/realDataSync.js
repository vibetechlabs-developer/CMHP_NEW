// Real-backend data sync for Products/Customers (the TABLE views on the
// Products/Customers tabs) - READ ONLY for now.
//
// Why a sync function instead of rewriting Operations.jsx: the real
// backend's Product/Customer serializers already return `id`/`code`/
// `name`/`email`/`phone`/`description`/`is_active` - the exact fields
// the existing (mock-built) table rows already read - so the lowest-
// risk way to connect them is to replace WHERE the Redux data comes
// from, not the components that render it. Call `syncRealOperationsData`
// whenever the active company changes (see src/context/WorkspaceContext.
// jsx) and it fetches the real lists for that company and dispatches
// them into the same `erp.products`/`erp.customers` slices the UI
// already reads - no component changes needed.
//
// WRITE PATHS ARE STILL MOCK-ONLY: `addProduct`/`editProduct`/
// `deleteProduct` and their Customer equivalents (see operationsService.
// js) still only mutate local Redux state via `nextId()` - a product
// added through the UI after a real sync is NOT sent to the backend and
// will disappear on the next sync/reload. This is a deliberate, narrower
// slice (read integration only), not a full round trip - write
// integration is a separate, not-yet-done step.
//
// ORDERS ARE DELIBERATELY NOT HANDLED HERE ANYMORE. An earlier version
// of this file mapped `GET .../batch-register/` (apps.batch_register,
// one row per BatchPlan) onto a Redux `erp.orders` array for the Orders
// screen - that was wrong: a BatchPlan summary is not a SalesOrder list.
// The Orders screen (src/features/operations/SalesOrdersPanel.jsx) now
// calls the real `apps.sales_orders` list endpoint directly, live, with
// its own pagination/search/permission handling - it does not go
// through Redux or this sync function at all. See that file and
// salesOrdersService.js.
import api from '../../api/axios'
import { getRealScopedCompanyId } from '../../utils/companyScope'
import { replaceCustomers, replaceProducts } from '../../store/erpSlice'

export async function syncRealOperationsData(dispatch, user) {
  const realCompanyId = getRealScopedCompanyId(user)
  if (!realCompanyId) {
    // No real company behind the current workspace (mock-only persona,
    // or Common Inventory, which has no single company) - leave
    // whatever is already in Redux untouched rather than wiping it.
    return
  }

  const [productsResult, customersResult] = await Promise.allSettled([
    api.get(`/v1/companies/${realCompanyId}/products/`, { params: { page_size: 100 } }),
    api.get(`/v1/companies/${realCompanyId}/customers/`, { params: { page_size: 100 } }),
  ])

  if (productsResult.status === 'fulfilled') {
    dispatch(replaceProducts(productsResult.value.data.results || []))
  }
  if (customersResult.status === 'fulfilled') {
    dispatch(replaceCustomers(customersResult.value.data.results || []))
  }
  // A failed call is left as-is (whatever Redux already had) rather than
  // wiping the list to empty on a transient network error - the existing
  // axios 401 interceptor already handles a real auth failure separately.
}
