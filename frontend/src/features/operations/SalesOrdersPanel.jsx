import { useEffect, useRef, useState } from 'react'

import Button from '../../components/Button'
import Alert from '../../components/Alert'
import usePermissions from '../../hooks/usePermissions'
import useAuth from '../../hooks/useAuth'
import { deleteOrderErrorMessage, deleteSalesOrder, listSalesOrders } from './salesOrdersService'
import { getErrorMessage } from '../../utils/errors'
import SalesOrderFormModal from './SalesOrderFormModal'
import ConfirmDialog from './ConfirmDialog'

const PAGE_SIZE = 20

// Real apps.sales_orders list - replaces the old BatchPlan-summary-as-
// "orders" table (a BatchPlan summary is not a SalesOrder list; the
// real BatchPlan/requisition register view still exists at the backend
// via apps.batch_register, just not wired to this screen anymore).
export default function SalesOrdersPanel() {
  const { loading: permissionsLoading, error: permissionsError, realCompanyId, hasPermission } = usePermissions()
  const { user } = useAuth()
  const operatingCompany = user?.profile?.real_companies?.find((company) => company.id === realCompanyId)
  const companyCode = operatingCompany?.code || ''
  const companyName = operatingCompany?.legal_name || ''

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [formState, setFormState] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const deletingRef = useRef(false) // null | {mode: 'create'|'edit', orderId?}

  const requestIdRef = useRef(0)

  const canView = hasPermission('sales_orders.view')
  const canCreate = hasPermission('sales_orders.create')
  const canDelete = hasPermission('sales_orders.delete')

  useEffect(() => {
    setPage(1)
  }, [search, realCompanyId])

  useEffect(() => {
    if (permissionsLoading) return
    if (!realCompanyId || !canView) {
      setData({ count: 0, results: [] })
      return
    }
    const thisRequestId = ++requestIdRef.current
    setListLoading(true)
    setListError('')
    listSalesOrders(realCompanyId, { page, pageSize: PAGE_SIZE, search })
      .then((result) => {
        // Guard against a slow response for a company/page the user has
        // since navigated away from landing late and overwriting newer
        // data - the same staleness protection usePermissions already
        // applies to its own fetch.
        if (requestIdRef.current !== thisRequestId) return
        setData(result)
        setListLoading(false)
      })
      .catch((error) => {
        if (requestIdRef.current !== thisRequestId) return
        setListError(getErrorMessage(error))
        setListLoading(false)
      })
  }, [permissionsLoading, realCompanyId, canView, page, search])

  // One attempt per explicit confirmation. The row leaves the list only after the
  // backend confirms the delete. A stale version (409) never retries by itself: the
  // list is reloaded and the user must confirm again.
  const confirmDelete = async () => {
    const order = pendingDelete
    if (!order || deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    try {
      await deleteSalesOrder(realCompanyId, order.id, order.version)
      setPendingDelete(null)
      refreshList()
    } catch (error) {
      setPendingDelete(null)
      setListError(deleteOrderErrorMessage(error))
      if (error?.response?.status === 409 || error?.response?.status === 404) refreshList()
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  const refreshList = () => {
    // Re-triggers the effect above by bumping nothing - simplest correct
    // way is to just re-run the same fetch inline.
    if (!realCompanyId) return
    setListLoading(true)
    listSalesOrders(realCompanyId, { page, pageSize: PAGE_SIZE, search })
      .then((result) => {
        setData(result)
        setListLoading(false)
      })
      .catch((error) => {
        setListError(getErrorMessage(error))
        setListLoading(false)
      })
  }

  if (permissionsLoading) {
    return (
      <div className="inv-panel">
        <p>Checking your access…</p>
      </div>
    )
  }

  if (permissionsError) {
    return (
      <div className="inv-panel">
        <Alert type="error">Could not load your permissions for this company: {getErrorMessage(permissionsError)}</Alert>
      </div>
    )
  }

  if (!realCompanyId) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          No real company is linked to the current workspace. Sales orders cannot be shown for a mock-only
          workspace.
        </Alert>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          Access unavailable. You cannot see sales orders for this company. Ask an administrator for access.</Alert>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Sales Orders</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7f95' }}>
            {data.count} order{data.count === 1 ? '' : 's'} for this company.
          </p>
        </div>
        {canCreate && <Button onClick={() => setFormState({ mode: 'create' })}>+ Add order</Button>}
      </div>

      <div className="inv-toolbar">
        <input
          className="field-input"
          style={{ maxWidth: 320 }}
          type="text"
          placeholder="Search by reference, customer name or customer order reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {listError && <Alert type="error">{listError}</Alert>}

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Order Date</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Subtotal</th>
              <th>Currency</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  Loading…
                </td>
              </tr>
            ) : data.results.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  No sales orders found.
                </td>
              </tr>
            ) : (
              data.results.map((order) => (
                <tr key={order.id}>
                  <td className="cell-strong">{order.reference}</td>
                  <td>{order.customer_name}</td>
                  <td>{order.order_date}</td>
                  <td>{order.status}</td>
                  <td>{order.lines.length}</td>
                  <td>{order.subtotal}</td>
                  <td>{order.currency}</td>
                  <td>
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() => setFormState({ mode: 'edit', orderId: order.id })}
                    >
                      {order.status === 'DRAFT' ? 'Edit' : 'View'}
                    </button>
                    {canDelete && order.status === 'DRAFT' && (
                      <button
                        type="button"
                        className="table-edit"
                        style={{ marginLeft: 12, color: '#b42318' }}
                        onClick={() => setPendingDelete(order)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="inv-toolbar">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete draft order?"
          message={
            <>
              <strong>{pendingDelete.reference}</strong>
              <br />
              This permanently removes the draft order. It cannot be undone. Orders that already have batch plans or store preparation cannot be deleted.
            </>
          }
          confirmLabel="Delete order"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {formState && (
        <SalesOrderFormModal
          // A new company or signed-in user gets a fresh window, so no form state carries over.
          key={`${realCompanyId}-${user?.id ?? user?.username ?? ''}-${formState.mode}-${formState.orderId ?? ''}`}
          realCompanyId={realCompanyId}
          companyCode={companyCode}
          companyName={companyName}
          orderId={formState.mode === 'edit' ? formState.orderId : null}
          permissions={{
            loading: permissionsLoading,
            canCreateOrder: hasPermission('sales_orders.create'),
            canEditOrder: hasPermission('sales_orders.edit'),
            canAddCustomer: hasPermission('customers.create'),
            canEditProduct: hasPermission('products.edit'),
            canViewFormulas: hasPermission('formulas.view'),
            canViewBmr: hasPermission('bmr.view'),
            canCreateBmr: hasPermission('bmr.create'),
            canEditBmr: hasPermission('bmr.edit'),
            canViewBatch: hasPermission('batch_plans.view'),
            canCreateBatch: hasPermission('batch_plans.create'),
            canEditBatch: hasPermission('batch_plans.edit'),
            canAllocateBatch: hasPermission('batch_plans.allocate_number'),
            canEditPrinting: hasPermission('batch_plans.printing_edit'),
            canDeleteOrder: canDelete,
          }}
          onClose={() => setFormState(null)}
          onSaved={() => refreshList()}
        />
      )}
    </div>
  )
}
