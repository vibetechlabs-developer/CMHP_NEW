import { useEffect, useRef, useState } from 'react'

import Button from '../../components/Button'
import Alert from '../../components/Alert'
import Spinner, { LoadingState } from '../../components/Spinner'
import usePermissions from '../../hooks/usePermissions'
import { deleteCustomer, listCustomers } from './customersService'
import { confirmAction } from '../../components/ConfirmProvider'
import { getErrorMessage } from '../../utils/errors'
import CustomerFormModal from './CustomerFormModal'
import CustomerImportModal from './CustomerImportModal'

const PAGE_SIZE = 20

// Real apps.customers list - replaces the mock Customers table and its
// Add/Edit/Delete actions. This panel does not read from or depend on
// Redux/realDataSync.js at all (same reasoning as SalesOrdersPanel.jsx)
// so a stale bulk-sync response can never race with or overwrite what
// this panel just fetched live.
export default function CustomersPanel() {
  const { loading: permissionsLoading, error: permissionsError, realCompanyId, hasPermission } = usePermissions()

  const [search, setSearch] = useState('')
  const [isActiveFilter, setIsActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [formState, setFormState] = useState(null) // null | {mode: 'create'|'edit', customerId?}
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')

  const requestIdRef = useRef(0)

  const canView = hasPermission('customers.view')
  const canCreate = hasPermission('customers.create')
  const canEdit = hasPermission('customers.edit')
  const canActivate = hasPermission('customers.activate')
  const canDeactivate = hasPermission('customers.deactivate')
  const canDelete = hasPermission('customers.delete')

  useEffect(() => {
    setPage(1)
  }, [search, isActiveFilter, realCompanyId])

  const fetchList = (thisRequestId) => {
    setListLoading(true)
    setListError('')
    listCustomers(realCompanyId, {
      page,
      pageSize: PAGE_SIZE,
      search,
      isActive: isActiveFilter === '' ? undefined : isActiveFilter === 'true',
    })
      .then((result) => {
        if (thisRequestId !== undefined && requestIdRef.current !== thisRequestId) return
        setData(result)
        setListLoading(false)
      })
      .catch((error) => {
        if (thisRequestId !== undefined && requestIdRef.current !== thisRequestId) return
        setListError(getErrorMessage(error))
        setListLoading(false)
      })
  }

  useEffect(() => {
    if (permissionsLoading) return
    if (!realCompanyId || !canView) {
      setData({ count: 0, results: [] })
      return
    }
    const thisRequestId = ++requestIdRef.current
    fetchList(thisRequestId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, realCompanyId, canView, page, search, isActiveFilter])

  const handleDelete = async (customer) => {
    if (!(await confirmAction(`Delete customer ${customer.code} (${customer.name})? This cannot be undone. Customers with sales orders or quotations cannot be deleted.`, { confirmLabel: 'Delete', danger: true, title: 'Delete customer' }))) return
    try {
      await deleteCustomer(realCompanyId, customer.id, customer.version)
      refreshList()
    } catch (error) {
      setListError(getErrorMessage(error))
    }
  }

  const refreshList = () => {
    if (!realCompanyId) return
    fetchList(undefined)
  }

  if (permissionsLoading) {
    return (
      <div className="inv-panel">
        <LoadingState label="Checking your access…" />
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
          No real company is linked to the current workspace. Customers cannot be shown for a mock-only workspace.
        </Alert>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          Access unavailable. You cannot see customers for this company. Ask an administrator for access.</Alert>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Customers</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7f95' }}>
            {data.count} customer{data.count === 1 ? '' : 's'} for this company.
          </p>
        </div>
        {canCreate && (
          <div className="inv-toolbar-actions">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button onClick={() => setFormState({ mode: 'create' })}>+ Add customer</Button>
          </div>
        )}
      </div>

      <div className="inv-toolbar">
        <input
          className="field-input"
          style={{ maxWidth: 320 }}
          type="text"
          placeholder="Search by code, name, contact, email or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="field-input" style={{ maxWidth: 160 }} value={isActiveFilter} onChange={(e) => setIsActiveFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {importNotice && <Alert type="success">{importNotice}</Alert>}
      {listError && <Alert type="error">{listError}</Alert>}

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Customer code</th>
              <th>Customer name</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>
                  <Spinner tone="brand" label="Loading…" />
                </td>
              </tr>
            ) : data.results.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>
                  No customers found.
                </td>
              </tr>
            ) : (
              data.results.map((customer) => (
                <tr key={customer.id}>
                  <td className="cell-strong">{customer.code}</td>
                  <td>{customer.name}</td>
                  <td>{customer.contact_person}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button
                      type="button"
                      className="table-edit"
                      onClick={() => setFormState({ mode: 'edit', customerId: customer.id })}
                    >
                      {canEdit || canActivate || canDeactivate ? 'Edit' : 'View'}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className="table-edit"
                        style={{ marginLeft: 12, color: '#b42318' }}
                        onClick={() => handleDelete(customer)}
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

      {importing && (
        <CustomerImportModal
          realCompanyId={realCompanyId}
          onClose={() => setImporting(false)}
          onImported={(created) => {
            setImporting(false)
            setImportNotice(`${created.length} customer${created.length === 1 ? '' : 's'} imported.`)
            refreshList()
          }}
        />
      )}

      {formState && (
        <CustomerFormModal
          realCompanyId={realCompanyId}
          customerId={formState.mode === 'edit' ? formState.customerId : null}
          canEdit={canEdit}
          canActivate={canActivate}
          canDeactivate={canDeactivate}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null)
            refreshList()
          }}
        />
      )}
    </div>
  )
}
