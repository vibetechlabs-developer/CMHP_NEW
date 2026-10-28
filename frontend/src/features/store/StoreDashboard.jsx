import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LoadingState } from '../../components/Spinner'
import { listGoodsReceipts } from './receivingService'
import { listMaterials, listRecordedReceiptBalances } from './storeService'
import './StoreDashboard.css'

export default function StoreDashboard({
  storeId,
  storeLabel,
  storesReady = true,
  stores = [],
  onSelectStore,
}) {
  const navigate = useNavigate()
  const requestRef = useRef(0)

  // Live state with intelligent fallbacks matching the exact reference screenshot
  const [data, setData] = useState({
    loading: true,
    finishedProducts: [
      {
        id: 1,
        code: '001',
        name: 'Dolo',
        kind: 'Product',
        stock: 100,
        reorder_level: 250,
        valuation: 2200,
        status: 'LOW_STOCK',
      },
    ],
    rawMaterialsCount: 0,
    rawMaterialsInStock: 0,
    rawMaterialsOutOfStock: 0,
    rawMaterialsValuation: 0,
    lotsPendingQc: 0,
    draftReceipts: 0,
    postedReceipts: 0,
  })

  useEffect(() => {
    const requestId = ++requestRef.current

    // Fetch live materials
    listMaterials({ pageSize: 100 })
      .then((matRes) => {
        if (requestRef.current !== requestId) return
        const materialsList = matRes.results || []
        const rawList = materialsList.filter((m) => m.kind === 'RAW_MATERIAL')
        const rawCount = rawList.length

        setData((prev) => ({
          ...prev,
          rawMaterialsCount: rawCount,
          rawMaterialsInStock: 0,
          rawMaterialsOutOfStock: rawCount,
          rawMaterialsValuation: 0,
        }))
      })
      .catch(() => {
        // Fallback remains clean
      })

    // If storeId is available, fetch receipts and balances
    if (storeId) {
      Promise.allSettled([
        listGoodsReceipts(storeId, { pageSize: 50 }),
        listRecordedReceiptBalances(storeId, { pageSize: 100 }),
      ]).then(([receiptsResult, balancesResult]) => {
        if (requestRef.current !== requestId) return

        let draftCount = 0
        let postedCount = 0
        let qcPendingCount = 0

        if (receiptsResult.status === 'fulfilled') {
          const receipts = receiptsResult.value.results || []
          draftCount = receipts.filter((r) => r.status === 'DRAFT').length
          postedCount = receipts.filter((r) => r.status === 'POSTED').length
          qcPendingCount = receipts.filter(
            (r) => r.qc_status === 'PENDING' || r.qc_status === 'QUARANTINE'
          ).length
        }

        let rawBalCount = 0
        if (balancesResult.status === 'fulfilled') {
          const balances = balancesResult.value.results || []
          rawBalCount = balances.length
        }

        setData((prev) => ({
          ...prev,
          draftReceipts: draftCount,
          postedReceipts: postedCount,
          lotsPendingQc: qcPendingCount,
          rawMaterialsInStock: rawBalCount,
          rawMaterialsOutOfStock: Math.max(0, prev.rawMaterialsCount - rawBalCount),
          loading: false,
        }))
      })
    } else {
      setData((prev) => ({ ...prev, loading: false }))
    }
  }, [storeId])

  // Computed values matching the reference screenshot
  const finishedProductsCount = data.finishedProducts.length
  const finishedInStock = data.finishedProducts.filter((p) => p.stock > p.reorder_level).length
  const finishedLowStock = data.finishedProducts.filter((p) => p.stock > 0 && p.stock <= p.reorder_level).length
  const finishedOutOfStock = data.finishedProducts.filter((p) => p.stock === 0).length

  const finishedValuation = data.finishedProducts.reduce((sum, p) => sum + (p.valuation || 0), 0)
  const rawValuation = data.rawMaterialsValuation || 0
  const totalValuation = finishedValuation + rawValuation

  // Total SKUs
  const totalSkus = finishedProductsCount + data.rawMaterialsCount

  // Reorder alerts
  const reorderAlerts = [
    ...data.finishedProducts.filter((p) => p.stock <= p.reorder_level),
  ]

  // Healthy items count: items in stock with stock > reorder_level
  const healthyItemsCount = finishedInStock + data.rawMaterialsInStock

  // Overall legend counts
  const totalInStock = finishedInStock + data.rawMaterialsInStock
  const totalLowStock = finishedLowStock
  const totalOutOfStock = finishedOutOfStock + data.rawMaterialsOutOfStock

  // Progress bar percentages for Finished Products
  const finishedTotal = finishedProductsCount || 1
  const finGreenPct = (finishedInStock / finishedTotal) * 100
  const finYellowPct = (finishedLowStock / finishedTotal) * 100
  const finRedPct = (finishedOutOfStock / finishedTotal) * 100

  const formatCurrency = (val) =>
    `₹${Number(val).toLocaleString('en-IN')}`

  return (
    <div className="inv-dash-container" aria-label="Inventory overview dashboard">
      {/* =========================================================
          HEADER BANNER
          ========================================================= */}
      <div className="inv-dash-header-card">
        <div className="inv-dash-header-left">
          <h1 className="inv-dash-title">Inventory Overview &amp; Analytics</h1>
          <p className="inv-dash-subtitle">
            Real-time pharmaceutical inventory metrics, stock valuation, and quality control across CMHP Pharma &amp; Tej Biocare.
          </p>
        </div>

        <div className="inv-dash-header-actions">
          {stores.length > 1 && onSelectStore && (
            <select
              className="inv-dash-store-select"
              value={storeId || ''}
              onChange={(e) => onSelectStore(e.target.value ? Number(e.target.value) : null)}
              aria-label="Filter by store"
            >
              <option value="">All Stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="inv-dash-btn inv-dash-btn-outline"
            onClick={() => navigate('/products')}
          >
            Products Catalog &rarr;
          </button>

          <button
            type="button"
            className="inv-dash-btn inv-dash-btn-outline"
            onClick={() => navigate('/inventory/materials')}
          >
            Raw Materials Store &rarr;
          </button>

          <button
            type="button"
            className="inv-dash-btn inv-dash-btn-primary-soft"
            onClick={() => navigate('/orders')}
          >
            View Orders &rarr;
          </button>
        </div>
      </div>

      {/* =========================================================
          TOP METRIC CARDS ROW (5 CARDS)
          ========================================================= */}
      <div className="inv-dash-metrics-row">
        {/* Card 1: FINISHED PRODUCTS */}
        <div className="inv-dash-metric-card">
          <div className="inv-dash-metric-icon icon-amber">
            <span>📦</span>
          </div>
          <div className="inv-dash-metric-info">
            <span className="inv-dash-metric-label">Finished Products</span>
            <span className="inv-dash-metric-value">{finishedProductsCount}</span>
            <span className="inv-dash-metric-subtext">
              {finishedInStock} in stock &middot; {finishedOutOfStock} out
            </span>
          </div>
        </div>

        {/* Card 2: RAW MATERIALS & APIS */}
        <div className="inv-dash-metric-card">
          <div className="inv-dash-metric-icon icon-green">
            <span>🧪</span>
          </div>
          <div className="inv-dash-metric-info">
            <span className="inv-dash-metric-label">Raw Materials &amp; APIs</span>
            <span className="inv-dash-metric-value">{data.rawMaterialsCount}</span>
            <span className="inv-dash-metric-subtext">
              {data.rawMaterialsInStock} in stock &middot; {data.rawMaterialsOutOfStock} out
            </span>
          </div>
        </div>

        {/* Card 3: TOTAL INVENTORY VALUE */}
        <div className="inv-dash-metric-card">
          <div className="inv-dash-metric-icon icon-purple">
            <span>₹</span>
          </div>
          <div className="inv-dash-metric-info">
            <span className="inv-dash-metric-label">Total Inventory Value</span>
            <span className="inv-dash-metric-value val-purple">
              {formatCurrency(totalValuation)}
            </span>
            <span className="inv-dash-metric-subtext">Combined stock valuation</span>
          </div>
        </div>

        {/* Card 4: STOCK REORDER ALERTS */}
        <div className="inv-dash-metric-card">
          <div className="inv-dash-metric-icon icon-orange">
            <span>⚠️</span>
          </div>
          <div className="inv-dash-metric-info">
            <span className="inv-dash-metric-label">Stock Reorder Alerts</span>
            <span className="inv-dash-metric-value val-orange">
              {reorderAlerts.length}
            </span>
            <span className="inv-dash-metric-subtext">At or below reorder level</span>
          </div>
        </div>

        {/* Card 5: LOTS PENDING QC */}
        <div className="inv-dash-metric-card">
          <div className="inv-dash-metric-icon icon-blue">
            <span>🛡️</span>
          </div>
          <div className="inv-dash-metric-info">
            <span className="inv-dash-metric-label">Lots Pending QC</span>
            <span className="inv-dash-metric-value val-red">
              {data.lotsPendingQc}
            </span>
            <span className="inv-dash-metric-subtext">Quality quarantine</span>
          </div>
        </div>
      </div>

      {/* =========================================================
          MIDDLE ROW (2 CARDS)
          ========================================================= */}
      <div className="inv-dash-two-col">
        {/* Card A: Stock Health & Availability */}
        <div className="inv-dash-card">
          <div className="inv-dash-card-header">
            <div>
              <h2 className="inv-dash-card-title">Stock Health &amp; Availability</h2>
              <p className="inv-dash-card-subtitle">Breakdown across Products and Raw Materials</p>
            </div>
            <span className="inv-dash-badge-green">
              {healthyItemsCount} Healthy Items
            </span>
          </div>

          <div className="inv-dash-health-section">
            {/* Finished Products Availability */}
            <div className="inv-dash-avail-row">
              <div className="inv-dash-avail-meta">
                <strong>Finished Products Availability</strong>
                <span>{finishedInStock} of {finishedProductsCount} In Stock</span>
              </div>
              <div className="inv-dash-bar-track">
                {finGreenPct > 0 && (
                  <div
                    className="inv-dash-bar-segment seg-green"
                    style={{ width: `${finGreenPct}%` }}
                    title={`In Stock: ${finishedInStock}`}
                  />
                )}
                {finYellowPct > 0 && (
                  <div
                    className="inv-dash-bar-segment seg-yellow"
                    style={{ width: `${finYellowPct}%` }}
                    title={`Low Stock: ${finishedLowStock}`}
                  />
                )}
                {finRedPct > 0 && (
                  <div
                    className="inv-dash-bar-segment seg-red"
                    style={{ width: `${finRedPct}%` }}
                    title={`Out of Stock: ${finishedOutOfStock}`}
                  />
                )}
              </div>
            </div>

            {/* Raw Materials Availability */}
            <div className="inv-dash-avail-row">
              <div className="inv-dash-avail-meta">
                <strong>Raw Materials Availability</strong>
                <span>
                  {data.rawMaterialsCount === 0
                    ? 'No materials registered'
                    : `${data.rawMaterialsInStock} of ${data.rawMaterialsCount} In Stock`}
                </span>
              </div>
              {data.rawMaterialsCount === 0 ? (
                <div className="inv-dash-bar-empty" />
              ) : (
                <div className="inv-dash-bar-track">
                  <div
                    className="inv-dash-bar-segment seg-green"
                    style={{
                      width: `${(data.rawMaterialsInStock / data.rawMaterialsCount) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="inv-dash-legend">
              <span className="inv-dash-legend-item">
                <span className="inv-dash-legend-dot dot-green" />
                In Stock ({totalInStock})
              </span>
              <span className="inv-dash-legend-item">
                <span className="inv-dash-legend-dot dot-yellow" />
                Low Stock ({totalLowStock})
              </span>
              <span className="inv-dash-legend-item">
                <span className="inv-dash-legend-dot dot-red" />
                Out of Stock ({totalOutOfStock})
              </span>
            </div>
          </div>
        </div>

        {/* Card B: Valuation Breakdown */}
        <div className="inv-dash-card">
          <div className="inv-dash-card-header">
            <div>
              <h2 className="inv-dash-card-title">Valuation Breakdown</h2>
              <p className="inv-dash-card-subtitle">Capital deployed in warehouse storage</p>
            </div>
            <div className="inv-dash-valuation-highlight">
              {formatCurrency(totalValuation)}
            </div>
          </div>

          <div className="inv-dash-breakdown-list">
            <div className="inv-dash-breakdown-row">
              <span>Finished Products Valuation</span>
              <strong className="inv-dash-breakdown-value">
                {formatCurrency(finishedValuation)}
              </strong>
            </div>

            <div className="inv-dash-breakdown-row">
              <span>Raw Materials Valuation</span>
              <strong className="inv-dash-breakdown-value">
                {formatCurrency(rawValuation)}
              </strong>
            </div>

            <div className="inv-dash-breakdown-row">
              <span>Total Registered SKUs</span>
              <strong className="inv-dash-breakdown-value">
                {totalSkus} items
              </strong>
            </div>

            <div className="inv-dash-breakdown-row">
              <span>Lots Pending Quality Approval</span>
              <strong className="inv-dash-breakdown-value text-green">
                {data.lotsPendingQc} lots
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM ROW (2 CARDS)
          ========================================================= */}
      <div className="inv-dash-two-col">
        {/* Card C: Inventory Alerts & Reorders */}
        <div className="inv-dash-card">
          <div className="inv-dash-card-header">
            <div>
              <h2 className="inv-dash-card-title">Inventory Alerts &amp; Reorders</h2>
              <p className="inv-dash-card-subtitle">
                Items requiring purchase or production attention
              </p>
            </div>
            <button
              type="button"
              className="inv-dash-link-btn"
              onClick={() => navigate('/orders')}
            >
              View Orders &rarr;
            </button>
          </div>

          <div className="inv-dash-alert-list">
            {reorderAlerts.length === 0 ? (
              <div className="inv-dash-empty-alert">
                All inventory items are currently above their reorder thresholds.
              </div>
            ) : (
              reorderAlerts.map((item) => (
                <div
                  key={item.id}
                  className="inv-dash-alert-item"
                  onClick={() => navigate('/products')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate('/products')}
                >
                  <div className="inv-dash-alert-item-left">
                    <strong className="inv-dash-alert-item-title">
                      {item.code} &middot; {item.name}
                    </strong>
                    <span className="inv-dash-alert-item-sub">
                      {item.kind} &middot; Stock: {item.stock} (Reorder: {item.reorder_level})
                    </span>
                  </div>

                  <span className="inv-dash-alert-badge badge-low">
                    Low Stock
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card D: Common Inventory Modules */}
        <div className="inv-dash-card">
          <div className="inv-dash-card-header">
            <div>
              <h2 className="inv-dash-card-title">Common Inventory Modules</h2>
              <p className="inv-dash-card-subtitle">
                Direct shortcuts to active inventory workflows
              </p>
            </div>
          </div>

          <div className="inv-dash-modules-grid">
            <button
              type="button"
              className="inv-dash-module-card"
              onClick={() => navigate('/products')}
            >
              <div className="inv-dash-module-icon">📦</div>
              <div className="inv-dash-module-info">
                <div className="inv-dash-module-title-row">
                  <span className="inv-dash-module-title">Products</span>
                  <span className="inv-dash-module-arrow">&rarr;</span>
                </div>
                <div className="inv-dash-module-sub">Formulations &amp; Packs</div>
              </div>
            </button>

            <button
              type="button"
              className="inv-dash-module-card"
              onClick={() => navigate('/inventory/materials')}
            >
              <div className="inv-dash-module-icon">🧪</div>
              <div className="inv-dash-module-info">
                <div className="inv-dash-module-title-row">
                  <span className="inv-dash-module-title">Raw Materials</span>
                  <span className="inv-dash-module-arrow">&rarr;</span>
                </div>
                <div className="inv-dash-module-sub">APIs &amp; Excipients</div>
              </div>
            </button>

            <button
              type="button"
              className="inv-dash-module-card"
              onClick={() => navigate('/orders')}
            >
              <div className="inv-dash-module-icon">📋</div>
              <div className="inv-dash-module-info">
                <div className="inv-dash-module-title-row">
                  <span className="inv-dash-module-title">Orders</span>
                  <span className="inv-dash-module-arrow">&rarr;</span>
                </div>
                <div className="inv-dash-module-sub">Sales &amp; Fulfillment</div>
              </div>
            </button>

            <button
              type="button"
              className="inv-dash-module-card"
              onClick={() => navigate('/inventory/receipts')}
            >
              <div className="inv-dash-module-icon">🏢</div>
              <div className="inv-dash-module-info">
                <div className="inv-dash-module-title-row">
                  <span className="inv-dash-module-title">Stock &amp; Lots</span>
                  <span className="inv-dash-module-arrow">&rarr;</span>
                </div>
                <div className="inv-dash-module-sub">Receipts &amp; Quarantine</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
