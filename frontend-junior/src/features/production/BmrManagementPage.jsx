/**
 * BMR Management Hub (Batch Manufacturing Records)
 * Complete central workspace for all pharmaceutical dosage form BMRs:
 * - Drops (19 Pages - SOP/QA/04/F-02/00)
 * - Syrup (19 Pages - SOP/QA/04/F-03/00)
 * - Mother Tincture (6 Pages - SOP/QA/04/F-01/00)
 * - Oil External Preparation (19 Pages - SOP/QA/04/F-04/00)
 * - Tablet (19 Pages - SOP/QA/04/F-05/00)
 * - Liquid Oral Formulation (19 Pages - SOP/QA/04/F-01/00)
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import { productionService } from './productionService'
import { listProducts } from '../products/productsService'
import { BMR_TEMPLATES, getBmrTemplate } from './bmrTemplates'
import { DOSAGE_FORMS } from '../../constants/dosageForms'
import useSelectedCompany from '../../hooks/useSelectedCompany'
import './BmrManagementPage.css'
import '../inventory/tabs/CommonInventory.css'

const EMPTY_LIST = []

export default function BmrManagementPage() {
  const navigate = useNavigate()
  const { companyId } = useSelectedCompany()

  // Redux fallbacks
  const reduxProducts = useSelector((state) => state.erp?.commonProducts || state.erp?.products) || EMPTY_LIST
  const reduxOrders = useSelector((state) => state.erp?.orders) || EMPTY_LIST

  const reduxRef = useRef({ products: reduxProducts, orders: reduxOrders })
  reduxRef.current = { products: reduxProducts, orders: reduxOrders }

  // State
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('products') // 'products' | 'orders' | 'templates'
  const [dosageFilter, setDosageFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  // Quick Launchpad state
  const [selectedProductId, setSelectedProductId] = useState('')
  const [launchDosageForm, setLaunchDosageForm] = useState('Syrup')
  const [launchBatchNo, setLaunchBatchNo] = useState('')
  const [launchBatchSize, setLaunchBatchSize] = useState('')

  // Load Products & Orders
  useEffect(() => {
    let isMounted = true

    // Safety timeout: never stay in loading >4s — fall back to Redux immediately
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setProducts((prev) => prev.length ? prev : reduxRef.current.products)
        setOrders((prev) => prev.length ? prev : reduxRef.current.orders)
        setLoading(false)
      }
    }, 4000)

    async function loadAll() {
      setLoading(true)
      try {
        // 1. Fetch products from API (race with 3s timeout — fallback to Redux)
        let prods = []
        if (companyId) {
          try {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            const res = await Promise.race([listProducts(companyId, { pageSize: 200 }), timeout])
            prods = res?.results || res?.data || []
          } catch {
            prods = []
          }
        }
        if (!prods || prods.length === 0) {
          prods = reduxRef.current.products
        }
        if (isMounted) setProducts(prods)

        // 2. Fetch production orders (mock delay ~200ms, always resolves)
        const ords = await productionService.getOrders()
        const ordList = Array.isArray(ords?.data) ? ords.data : (Array.isArray(ords) ? ords : [])
        if (isMounted) setOrders(ordList.length ? ordList : reduxRef.current.orders)
      } catch (err) {
        console.warn('BmrManagementPage load error:', err)
        if (isMounted) {
          setProducts(reduxRef.current.products)
          setOrders(reduxRef.current.orders)
        }
      } finally {
        clearTimeout(safetyTimer)
        if (isMounted) setLoading(false)
      }
    }
    loadAll()
    return () => {
      isMounted = false
      clearTimeout(safetyTimer)
    }
  }, [companyId])

  // When user selects a product in the quick launchpad, auto-detect dosage form & batch defaults
  const handleProductSelect = (pId) => {
    setSelectedProductId(pId)
    const prod = products.find((p) => String(p.id) === String(pId))
    if (prod) {
      const detectedForm = prod.dosage_form || prod.dosageForm || prod.type || prod.product_type || prod.category || 'Syrup'
      setLaunchDosageForm(detectedForm)
      const cleanCode = (prod.code || prod.sku || 'BATCH').replace(/[^a-zA-Z0-9]/g, '')
      setLaunchBatchNo(`${cleanCode}-01`)
      setLaunchBatchSize(prod.pack_size || prod.batch_size || '1000 LTR')
    }
  }

  // Launch digital BMR editor with parameters
  const launchBmr = ({ productId, productCode, productName, dosageForm, bmrNo, packSize, orderId }) => {
    const params = new URLSearchParams()
    if (orderId) params.set('orderId', orderId)
    if (productId) params.set('productId', productId)
    if (productCode) params.set('productCode', productCode)
    if (productName) params.set('productName', productName)
    if (dosageForm) params.set('dosageForm', dosageForm)
    if (bmrNo) params.set('bmrNo', bmrNo)
    if (packSize) params.set('packSize', packSize)
    params.set('returnTo', '/bmr-records')

    navigate(`/production/bmr?${params.toString()}`)
  }

  // Handle Quick Launch submit
  const handleLaunchSubmit = (e) => {
    e.preventDefault()
    const prod = products.find((p) => String(p.id) === String(selectedProductId))
    launchBmr({
      productId: prod?.id || '',
      productCode: prod?.code || prod?.sku || '',
      productName: prod?.name || prod?.title || 'Custom Product',
      dosageForm: launchDosageForm,
      bmrNo: launchBatchNo,
      packSize: launchBatchSize,
    })
  }

  // Filter products by dosage form & search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const form = (p.dosage_form || p.dosageForm || p.type || p.category || '').toLowerCase()
      if (dosageFilter !== 'ALL') {
        const target = dosageFilter.toLowerCase()
        if (!form.includes(target) && target !== form) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (p.name || p.title || '').toLowerCase()
        const code = (p.code || p.sku || '').toLowerCase()
        return name.includes(q) || code.includes(q)
      }
      return true
    })
  }, [products, dosageFilter, search])

  // Filter orders by dosage form & search
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const form = (o.dosage_form || o.dosageForm || o.product_type || '').toLowerCase()
      if (dosageFilter !== 'ALL') {
        const target = dosageFilter.toLowerCase()
        if (!form.includes(target) && target !== form) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const prod = (o.product_name || o.name || '').toLowerCase()
        const batch = (o.batch_no || o.batch || '').toLowerCase()
        const orderNo = (o.number || o.id || '').toLowerCase()
        return prod.includes(q) || batch.includes(q) || orderNo.includes(q)
      }
      return true
    })
  }, [orders, dosageFilter, search])

  return (
    <div className="bmr-mgmt-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/dashboard' },
          { label: 'Production', to: '/production' },
          { label: 'BMR Records' },
        ]}
        title="Batch Manufacturing Records (BMR)"
        subtitle="Manage and launch digital BMRs across all dosage forms (Syrup, Drops, Mother Tincture, Oil, Tablet, Liquid) linked directly to Product Catalog."
        pill="Pharma BMR Hub"
      />

      <HeroBanner
        eyebrow="DIGITAL GMP COMPLIANCE"
        title="Pharmaceutical BMR Management"
        subtitle="Full 19-Page and 6-Page GMP batch records with auto-scaling, material requisitions, and multi-department signoffs."
      />

      {/* ── 1. QUICK BMR LAUNCHPAD (Fetch by Product) ── */}
      <div className="bmr-launchpad-card">
        <div className="bmr-launchpad-title">
          <span>⚡</span>
          <h3>Quick BMR Generator by Product</h3>
        </div>
        <p className="bmr-launchpad-desc">
          Select any finished product from your master catalog. The system will auto-detect its dosage form and open the exact digital BMR form for production filling.
        </p>

        <form onSubmit={handleLaunchSubmit} className="bmr-launchpad-grid">
          <div className="bmr-field-group">
            <label>📦 Select Product</label>
            <select
              className="bmr-select"
              value={selectedProductId}
              onChange={(e) => handleProductSelect(e.target.value)}
              required
            >
              <option value="">-- Choose Product from Master List --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ''}{p.name || p.title} ({p.dosage_form || p.dosageForm || 'Dosage N/A'})
                </option>
              ))}
            </select>
          </div>

          <div className="bmr-field-group">
            <label>🧪 Dosage Form / BMR Type</label>
            <select
              className="bmr-select"
              value={launchDosageForm}
              onChange={(e) => setLaunchDosageForm(e.target.value)}
            >
              {DOSAGE_FORMS.map((df) => (
                <option key={df} value={df}>
                  {df} {df === 'Mother Tincture' ? '(6 Pages)' : '(19 Pages)'}
                </option>
              ))}
            </select>
          </div>

          <div className="bmr-field-group">
            <label>🔢 Batch Number</label>
            <input
              type="text"
              className="bmr-input"
              value={launchBatchNo}
              onChange={(e) => setLaunchBatchNo(e.target.value)}
              placeholder="e.g. BATCH-01"
              required
            />
          </div>

          <div className="bmr-field-group">
            <label>⚖️ Batch Size / Pack</label>
            <input
              type="text"
              className="bmr-input"
              value={launchBatchSize}
              onChange={(e) => setLaunchBatchSize(e.target.value)}
              placeholder="e.g. 1000 LTR"
            />
          </div>

          <Button type="submit" variant="primary" style={{ height: 38, padding: '0 20px', whiteSpace: 'nowrap' }}>
            🚀 Open & Fill BMR
          </Button>
        </form>
      </div>

      {/* ── 2. KPI SUMMARY ── */}
      <div className="bmr-kpi-row">
        <div className="bmr-kpi-card">
          <div className="bmr-kpi-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>📑</div>
          <div className="bmr-kpi-info">
            <span className="bmr-kpi-val">6 Templates</span>
            <span className="bmr-kpi-lbl">Drops, Syrup, MT, Oil, Tablet, Liquid</span>
          </div>
        </div>
        <div className="bmr-kpi-card">
          <div className="bmr-kpi-icon" style={{ background: '#fef3c7', color: '#b45309' }}>📦</div>
          <div className="bmr-kpi-info">
            <span className="bmr-kpi-val">{products.length} Products</span>
            <span className="bmr-kpi-lbl">Catalog Master Linked</span>
          </div>
        </div>
        <div className="bmr-kpi-card">
          <div className="bmr-kpi-icon" style={{ background: '#dcfce7', color: '#15803d' }}>🏭</div>
          <div className="bmr-kpi-info">
            <span className="bmr-kpi-val">{orders.length} Batches</span>
            <span className="bmr-kpi-lbl">Live Production Orders</span>
          </div>
        </div>
        <div className="bmr-kpi-card">
          <div className="bmr-kpi-icon" style={{ background: '#f3e8ff', color: '#7e22ce' }}>🌿</div>
          <div className="bmr-kpi-info">
            <span className="bmr-kpi-val">Mother Tincture</span>
            <span className="bmr-kpi-lbl">6-Page Specialized SOP</span>
          </div>
        </div>
      </div>

      {/* ── 3. VIEW TABS ── */}
      <div className="bmr-mgmt-tabs">
        <button
          type="button"
          className={`bmr-tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <span>📦 Products BMR Catalog</span>
          <span className="bmr-tab-badge">{filteredProducts.length}</span>
        </button>

        <button
          type="button"
          className={`bmr-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span>🏭 Production Orders BMR</span>
          <span className="bmr-tab-badge">{filteredOrders.length}</span>
        </button>

        <button
          type="button"
          className={`bmr-tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <span>📑 BMR Templates Reference Guide</span>
        </button>
      </div>

      {/* ── 4. FILTER BAR ── */}
      {activeTab !== 'templates' && (
        <div className="bmr-filter-bar">
          <div className="bmr-pills-wrap">
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Filter Dosage Form:</span>
            {['ALL', 'Drops', 'Syrup', 'Mother Tincture', 'Oil', 'Tablet', 'Liquid'].map((d) => (
              <button
                key={d}
                type="button"
                className={`bmr-pill-btn ${dosageFilter === d ? 'active' : ''}`}
                onClick={() => setDosageFilter(d)}
              >
                {d}
              </button>
            ))}
          </div>

          <div style={{ minWidth: 260 }}>
            <input
              type="text"
              className="company-input"
              placeholder="🔍 Search product name, code, batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* ── 5. TAB CONTENT ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <p>Loading Products and BMR Records…</p>
        </div>
      ) : activeTab === 'products' ? (
        /* ── PRODUCTS BMR CATALOG ── */
        <div className="ci-table-card">
          <table className="ci-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Product Name</th>
                <th style={{ width: 140 }}>Dosage Form</th>
                <th style={{ width: 120 }}>Pack Size</th>
                <th>Applicable BMR Template</th>
                <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                    No products found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const dForm = p.dosage_form || p.dosageForm || p.type || p.category || 'Syrup'
                  const tmpl = getBmrTemplate(dForm)
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, color: '#0369a1' }}>
                        {p.code || p.sku || '—'}
                      </td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{p.name || p.title}</strong>
                        {p.generic_name && (
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>{p.generic_name}</div>
                        )}
                      </td>
                      <td>
                        <StatusPill tone="info">{dForm}</StatusPill>
                      </td>
                      <td style={{ color: '#475569', fontSize: 12.5 }}>
                        {p.pack_size || p.packing || p.unit || '—'}
                      </td>
                      <td>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                          {tmpl?.title || `${dForm} BMR`}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {tmpl?.department || 'Production Department'} • {tmpl?.formNo || 'SOP/QA/04'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => launchBmr({
                            productId: p.id,
                            productCode: p.code || p.sku,
                            productName: p.name || p.title,
                            dosageForm: dForm,
                            bmrNo: `${(p.code || 'BMR').replace(/[^a-zA-Z0-9]/g, '')}-01`,
                            packSize: p.pack_size,
                          })}
                        >
                          📝 Fill BMR
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'orders' ? (
        /* ── PRODUCTION ORDERS BMR ── */
        <div className="ci-table-card">
          <table className="ci-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Order No.</th>
                <th>Product</th>
                <th style={{ width: 130 }}>Batch No.</th>
                <th style={{ width: 120 }}>Batch Size</th>
                <th style={{ width: 130 }}>Dosage Form</th>
                <th style={{ width: 110 }}>BMR Status</th>
                <th style={{ width: 140, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                    No production orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const dForm = o.dosage_form || o.dosageForm || o.product_type || 'Drops'
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>
                        {o.number || o.id}
                      </td>
                      <td>
                        <strong>{o.product_name || o.name || '—'}</strong>
                        {o.customer_name && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>Cust: {o.customer_name}</div>
                        )}
                      </td>
                      <td>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                          {o.batch_no || o.batch || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {o.batch_size || (o.quantity != null ? `${o.quantity} Units` : '—')}
                      </td>
                      <td>
                        <StatusPill tone="info">{dForm}</StatusPill>
                      </td>
                      <td>
                        <StatusPill tone={o.bmr_status === 'YES' ? 'success' : 'warning'}>
                          {o.bmr_status === 'YES' ? '✓ Completed' : '⏳ Pending'}
                        </StatusPill>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => launchBmr({
                            orderId: o.id,
                            dosageForm: dForm,
                            bmrNo: o.batch_no,
                          })}
                        >
                          📋 Open BMR
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => navigate(`/qc/view/${o.id}`)}
                          style={{ marginLeft: 6 }}
                        >
                          📜 View CoA
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── BMR TEMPLATES REFERENCE GUIDE ── */
        <div className="bmr-templates-grid">
          {Object.entries(BMR_TEMPLATES)
            .filter(([k, tmpl]) => tmpl && tmpl.isAvailable && !k.endsWith('s') && k !== 'Drop' && k !== 'MT' && k !== 'MotherTincture' && k !== 'Mother-Tincture')
            .map(([formName, tmpl]) => (
              <div key={formName} className="bmr-template-card">
                <div>
                  <div className="bmr-template-card-header">
                    <div>
                      <h4 className="bmr-template-card-title">{tmpl.title}</h4>
                      <div className="bmr-template-card-dept">{tmpl.department}</div>
                    </div>
                    <StatusPill tone="success">{tmpl.pagesCount} Pages</StatusPill>
                  </div>

                  <div className="bmr-template-card-specs">
                    <div>
                      <span>Form Number:</span>
                      <strong>{tmpl.formNo}</strong>
                    </div>
                    <div>
                      <span>Dosage Form:</span>
                      <strong>{tmpl.dosageForm}</strong>
                    </div>
                    <div>
                      <span>Sections:</span>
                      <strong>{tmpl.sections?.length || 19} GMP Sections</strong>
                    </div>
                    <div>
                      <span>Master Copy Stamp:</span>
                      <strong>{tmpl.hideMasterCopy ? 'No (Plain)' : 'Yes (Master Stamp)'}</strong>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => launchBmr({
                    dosageForm: tmpl.dosageForm,
                    bmrNo: `DEMO-${tmpl.dosageForm.toUpperCase().replace(/\s+/g, '')}-01`,
                    productName: `${tmpl.dosageForm} Master Formulation`,
                  })}
                  style={{ width: '100%' }}
                >
                  🚀 Open Sample {tmpl.dosageForm} BMR
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

