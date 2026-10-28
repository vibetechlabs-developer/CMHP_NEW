// Real product catalog - replaces the mock Redux-backed
// (state.erp.commonProducts) CommonProductsTab with the real
// apps.products integration, reusing this screen's own approved
// ci-* visual system (header card/summary cards/filters/table), the
// same pattern already used for the real Materials integration.
//
// Products are COMPANY-owned on the real backend (never a shared/
// cross-company catalog like Materials) - this screen makes that
// explicit with its own real, unbounded company selector (useSelected
// Company, GET /v1/companies/mine/), never the fixed Company A/B
// workspace-bridge slots. The Product model has no stock/quantity/
// valuation field anywhere on the real backend, so the four stock-style
// summary cards the mock version showed are removed entirely rather than
// kept as a fabricated "Not tracked" placeholder for a concept that
// isn't part of this model at all (unlike Materials' register, where the
// concept genuinely exists but isn't computed yet).
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Spinner from '../../../components/Spinner'
import useSelectedCompany from '../../../hooks/useSelectedCompany'
import useCompanyPermissions from '../../../hooks/useCompanyPermissions'
import { getErrorMessage } from '../../../utils/errors'
import { useConfirmDialog } from '../components/ConfirmDialog'
import ImportProductsModal from '../../products/ImportProductsModal'
import ProductFormModal from '../../products/ProductFormModal'
import { deleteProduct, listProducts } from '../../products/productsService'
import './CommonInventory.css'

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function renderQaBadge(rawStatus) {
  const status = String(rawStatus || '').toUpperCase()
  if (status === 'APPROVED') {
    return (
      <span className="ci-badge ci-badge-approved" title="Formula approved by QA">
        ✓ Approved
      </span>
    )
  }
  if (status === 'SUBMITTED' || status === 'PENDING') {
    return (
      <span className="ci-badge ci-badge-submitted" title="Submitted for QA review">
        ⏳ Submitted
      </span>
    )
  }
  if (status === 'DRAFT') {
    return (
      <span className="ci-badge ci-badge-draft" title="Formula draft created">
        Draft
      </span>
    )
  }
  return (
    <span className="ci-badge ci-badge-neutral" title="Formula calculation has not been submitted to QA">
      Not Submitted
    </span>
  )
}

export default function ProductsPage() {
  const { companies, companiesReady, companiesError, companyId, setCompanyId } = useSelectedCompany()
  const { loading: permissionsLoading, hasPermission } = useCompanyPermissions(companyId)

  const canView = hasPermission('products.view')
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canActivate = hasPermission('products.activate')
  const canDeactivate = hasPermission('products.deactivate')
  const canDelete = hasPermission('products.delete')
  const canImport = hasPermission('products.import') && canCreate
  const canFormulas = hasPermission('formulas.view')

  const location = useLocation()
  const formulasBasePath = location.pathname.startsWith('/inventory')
    ? '/inventory/products'
    : '/products'

  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const pageSize = Math.max(1, Number(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE)
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const hasActiveFilters = Boolean(search || status)

  const setFilter = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === '' || value === undefined) next.delete(key)
        else next.set(key, String(value))
      })
      return next
    }, { replace: true })
  }
  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      ;['search', 'status', 'page'].forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }

  const { confirm, ConfirmNode } = useConfirmDialog()

  const [data, setData] = useState({ count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editing, setEditing] = useState(null) // null | {mode:'create'} | {mode:'edit', productId}
  const [importing, setImporting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!companyId || permissionsLoading || !canView) {
      setData({ count: 0, results: [] })
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    listProducts(companyId, { search, isActive: status, page, pageSize })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setData({ count: result.count || 0, results: result.results || [] })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setError(getErrorMessage(err))
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false)
      })
  }, [companyId, permissionsLoading, canView, search, status, page, pageSize, reloadKey])

  const reload = (message) => {
    if (message) setNotice(message)
    setReloadKey((key) => key + 1)
  }

  const handleDelete = async (product) => {
    const ok = await confirm({
      title: 'Delete product?',
      message: `"${product.code} — ${product.name}" will be permanently deleted. This cannot be undone. Products linked to orders, quotations or formulas cannot be deleted.`,
      confirmLabel: 'Yes, delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return
    setBusyId(product.id)
    try {
      await deleteProduct(companyId, product.id, product.version)
      reload(`${product.code} deleted.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.count / pageSize))
  const rangeStart = data.count === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, data.count)

  return (
    <div className="ci-container">
      <div className="ci-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        {/* Row 1: title */}
        <div className="ci-header-titles">
          <h2>Products</h2>
          <p>Finished products for the selected company's own catalog - never shared across companies.</p>
        </div>
        {/* Row 2: company dropdown (left) + action buttons (right) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {companies.length > 1 && (
            <select
              className="company-input"
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Company"
            >
              <option value="">Choose a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name || c.legal_name || c.code}</option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
            {canImport && (
              <Button type="button" variant="secondary" onClick={() => setImporting(true)}>
                <span aria-hidden="true">📥</span> Import CSV
              </Button>
            )}
            {canCreate && (
              <Button type="button" variant="primary" onClick={() => setEditing({ mode: 'create' })}>+ Add Product</Button>
            )}
          </div>
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {companiesError && <Alert type="error">Could not load your companies: {companiesError}</Alert>}
      {error && (
        <Alert type="error">
          {error}{' '}
          <button type="button" className="ci-row-link" onClick={() => reload()}>Retry</button>
        </Alert>
      )}

      {!companiesReady && <Spinner size="sm" tone="muted" label="Loading your companies…" />}

      {companiesReady && companies.length === 0 && (
        <Alert type="error">No company is linked to your account. Products cannot be shown.</Alert>
      )}

      {companiesReady && companies.length > 0 && !companyId && (
        <div className="ci-empty-card">
          <div className="ci-empty-icon">🏢</div>
          <div className="ci-empty-title">Choose a company</div>
          <p className="ci-empty-desc">Select a company above to see its products.</p>
        </div>
      )}

      {companyId && !permissionsLoading && !canView && (
        <Alert type="error">You cannot see products for this company. Ask an administrator for access.</Alert>
      )}

      {companyId && (permissionsLoading || canView) && (
        <>
          <div className="inv-filters-bar">
            <input
              type="search"
              placeholder="Search by product code or name…"
              aria-label="Search products"
              value={search}
              onChange={(e) => setFilter({ search: e.target.value, page: null })}
              className="company-input"
              style={{ minWidth: 220, flex: 1.5 }}
            />
            <select className="company-input" aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value, page: null })} style={{ width: 150 }}>
              <option value="">Active &amp; Inactive</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
            <select className="company-input" aria-label="Page size" value={pageSize} onChange={(e) => setFilter({ pageSize: e.target.value, page: null })} style={{ width: 110 }}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
            {hasActiveFilters && <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>}
          </div>

          {!loading && !error && data.results.length === 0 ? (
            <div className="ci-empty-card">
              <div className="ci-empty-icon">🔍</div>
              <div className="ci-empty-title">No products {hasActiveFilters ? 'match your filters' : 'yet'}</div>
              {hasActiveFilters && <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            </div>
          ) : (
            <div className="ci-table-card">
              <div className="ci-table-wrapper">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Pack Size</th>
                      <th>BMR No.</th>
                      <th>Status</th>
                      <th>QA Approval</th>
                      {canFormulas && <th>Formulas</th>}
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((product) => (
                      <tr key={product.id}>
                        <td className="ci-code">{product.code}</td>
                        <td style={{ fontWeight: 600 }}>{product.name}</td>
                        <td>{product.product_type || '—'}</td>
                        <td>{product.pack_size || '—'}</td>
                        <td>{product.bmr_no || '—'}</td>
                        <td>
                          <span className={`ci-badge ${product.is_active ? 'ci-badge-active' : 'ci-badge-inactive'}`}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          {renderQaBadge(product.qa_approval_status || product.qc_approval_status)}
                        </td>
                        {canFormulas && (
                          <td>
                            <Link className="ci-row-btn ci-row-btn-formula" to={`${formulasBasePath}/${companyId}/${product.id}/formulas`}>
                              ✏️ Formula
                            </Link>
                          </td>
                        )}
                        <td>
                          <div className="ci-row-actions">
                            <button type="button" className="table-edit" onClick={() => setEditing({ mode: 'edit', productId: product.id })}>
                              {canEdit || canActivate || canDeactivate ? 'Edit' : 'View'}
                            </button>
                            {canDelete && (
                              <button type="button" className="table-delete" onClick={() => handleDelete(product)} disabled={busyId === product.id}>
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {loading && data.results.length === 0 && (
                      <tr>
                        <td colSpan={canFormulas ? 9 : 8} style={{ textAlign: 'center', padding: '28px 0' }}>
                          <Spinner tone="brand" label="Loading products…" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && data.results.length > 0 && (
                <div className="ci-pagination-bar">
                  <span className="ci-pagination-info">
                    Showing {rangeStart}–{rangeEnd} of {data.count} product{data.count === 1 ? '' : 's'}
                  </span>
                  <div className="ci-pagination-controls">
                    <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setFilter({ page: page - 1 })}>Previous</Button>
                    <span style={{ padding: '0 8px', fontSize: 13, fontWeight: 600 }}>{page} / {totalPages}</span>
                    <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setFilter({ page: page + 1 })}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <ProductFormModal
          companyId={companyId}
          productId={editing.mode === 'edit' ? editing.productId : null}
          canEdit={canEdit}
          canActivate={canActivate}
          canDeactivate={canDeactivate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload('Product saved.')
          }}
        />
      )}

      {importing && (
        <ImportProductsModal
          companyId={companyId}
          onClose={() => setImporting(false)}
          onImported={(result) => {
            setImporting(false)
            reload(`${result.created_product_ids?.length || 0} product(s) imported.`)
          }}
        />
      )}

      {ConfirmNode}
    </div>
  )
}
