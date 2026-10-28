import { useEffect, useRef, useState } from 'react'

import Button from '../../components/Button'
import Alert from '../../components/Alert'
import Spinner, { LoadingState } from '../../components/Spinner'
import usePermissions from '../../hooks/usePermissions'
import { deleteProduct, listProducts } from './productsService'
import { confirmAction } from '../../components/ConfirmProvider'
import ImportProductsModal from './ImportProductsModal'
import { getErrorMessage } from '../../utils/errors'
import ProductFormModal from './ProductFormModal'
import FormulasPage from '../formulas/FormulasPage'

const PAGE_SIZE = 20

// Real apps.products list - replaces the mock Products table and its
// Add/Edit/Delete actions. Server-side search/pagination only (never
// downloads the full 2000+ row catalog), and does not read from or
// depend on Redux/realDataSync.js (same reasoning as SalesOrdersPanel.jsx
// / CustomersPanel.jsx) so a stale bulk-sync response can never race
// with or overwrite what this panel just fetched live.
export default function ProductsPanel() {
  const { loading: permissionsLoading, error: permissionsError, realCompanyId, hasPermission } = usePermissions()

  const [search, setSearch] = useState('')
  const [isActiveFilter, setIsActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [formState, setFormState] = useState(null) // null | {mode: 'create'|'edit', productId?}
  const [importing, setImporting] = useState(false)
  // Product workspace (details and formulas) for one product, or null for the list.
  const [workspace, setWorkspace] = useState(null)

  const requestIdRef = useRef(0)

  const canView = hasPermission('products.view')
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canActivate = hasPermission('products.activate')
  const canDeactivate = hasPermission('products.deactivate')
  const canDelete = hasPermission('products.delete')
  const canImport = hasPermission('products.import') && hasPermission('products.create')
  const canFormulas = hasPermission('formulas.view')

  useEffect(() => {
    setPage(1)
  }, [search, isActiveFilter, realCompanyId])

  const fetchList = (thisRequestId) => {
    setListLoading(true)
    setListError('')
    listProducts(realCompanyId, {
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

  const handleDelete = async (product) => {
    if (!(await confirmAction(`Delete product ${product.code} (${product.name})? This cannot be undone. Products used by orders, quotations or formulas cannot be deleted.`, { confirmLabel: 'Delete', danger: true, title: 'Delete product' }))) return
    try {
      await deleteProduct(realCompanyId, product.id, product.version)
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
          No real company is linked to the current workspace. Products cannot be shown for a mock-only workspace.
        </Alert>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="inv-panel">
        <Alert type="error">
          Access unavailable. You cannot see products for this company. Ask an administrator for access.</Alert>
      </div>
    )
  }

  // Product workspace: the list above keeps its search, filters and page while open.
  if (workspace) {
    return (
      <ProductWorkspace
        companyId={realCompanyId}
        product={workspace.product}
        tab={workspace.tab}
        onTab={(tab) => setWorkspace((prev) => ({ ...prev, tab }))}
        onBack={() => setWorkspace(null)}
        canEdit={canEdit}
        canActivate={canActivate}
        canDeactivate={canDeactivate}
        canFormulas={canFormulas}
        onProductSaved={() => refreshList()}
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Products</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7f95' }}>
            {data.count} product{data.count === 1 ? '' : 's'} for this company.
          </p>
        </div>
        <div className="inv-toolbar-actions">
          {canImport && (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
          )}
          {canCreate && <Button onClick={() => setFormState({ mode: 'create' })}>+ Add product</Button>}
        </div>
      </div>

      <div className="inv-toolbar">
        <input
          className="field-input"
          style={{ maxWidth: 320 }}
          type="text"
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="field-input" style={{ maxWidth: 160 }} value={isActiveFilter} onChange={(e) => setIsActiveFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {listError && <Alert type="error">{listError}</Alert>}

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Pack Size</th>
              <th>Sales Unit</th>
              <th>BMR No.</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  <Spinner tone="brand" label="Loading…" />
                </td>
              </tr>
            ) : data.results.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  No products found.
                </td>
              </tr>
            ) : (
              data.results.map((product) => (
                <tr key={product.id}>
                  <td className="cell-strong">{product.code}</td>
                  <td>{product.name}</td>
                  <td>{product.product_type}</td>
                  <td>{product.pack_size || '—'}</td>
                  <td>
                    {product.sales_uom_code}
                    {!product.sales_uom_is_active && ' (unit inactive)'}
                  </td>
                  <td>{product.bmr_no || '—'}</td>
                  <td>{product.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                      {canFormulas && (
                        <button
                          type="button"
                          className="table-edit"
                          onClick={() => setWorkspace({ product, tab: 'formulas' })}
                        >
                          Formulas
                        </button>
                      )}
                      <button
                        type="button"
                        className="table-edit"
                        onClick={() => setFormState({ mode: 'edit', productId: product.id })}
                      >
                        {canEdit || canActivate || canDeactivate ? 'Edit' : 'View'}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          className="table-delete"
                          onClick={() => handleDelete(product)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
        <ImportProductsModal
          realCompanyId={realCompanyId}
          onClose={() => setImporting(false)}
          onImported={() => refreshList()}
        />
      )}

      {formState && (
        <ProductFormModal
          realCompanyId={realCompanyId}
          productId={formState.mode === 'edit' ? formState.productId : null}
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

// Product detail workspace: two tabs, Product details and Formulas. The
// Formulas tab reuses the same formula components as the order drawer.
function ProductWorkspace({
  companyId,
  product,
  tab,
  onTab,
  onBack,
  canEdit,
  canActivate,
  canDeactivate,
  canFormulas,
  onProductSaved,
}) {
  const [editing, setEditing] = useState(false)
  const tabs = [['details', 'Product details']]
  if (canFormulas) tabs.push(['formulas', 'Formulas'])

  return (
    <section className="pw-page">
      <div>
        <button type="button" className="pw-back" onClick={onBack}>
          ← Back to products
        </button>
      </div>
      <header className="pw-head">
        <h2 className="pw-title">{product.name}</h2>
        <p className="pw-sub">{product.code}</p>
      </header>
      <div className="pw-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'pw-tab active' : 'pw-tab'}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="pw-card">
          <dl className="pw-facts">
            <div>
              <dt>Code</dt>
              <dd>{product.code}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>{product.name}</dd>
            </div>
            <div>
              <dt>Product type</dt>
              <dd>{product.product_type || '—'}</dd>
            </div>
            <div>
              <dt>Sales unit</dt>
              <dd>{product.sales_uom_code || '—'}</dd>
            </div>
            <div>
              <dt>BMR No.</dt>
              <dd>{product.bmr_no || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{product.is_active ? 'Active' : 'Inactive'}</dd>
            </div>
          </dl>
          {(canEdit || canActivate || canDeactivate) && (
            <div>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit product
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'formulas' && canFormulas && (
        <FormulasPage
          embedded
          productId={product.id}
          lockedProduct={{ id: product.id, label: `${product.code} · ${product.name}` }}
        />
      )}

      {editing && (
        <ProductFormModal
          realCompanyId={companyId}
          productId={product.id}
          canEdit={canEdit}
          canActivate={canActivate}
          canDeactivate={canDeactivate}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onProductSaved()
          }}
        />
      )}
    </section>
  )
}
