import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { confirmAction } from '../../components/ConfirmProvider'
import { getErrorMessage } from '../../utils/errors'
import { allocateBatchNumber, listBatchPlans } from '../manufacturing/batchPlansService'
import { bmrDbService } from '../production/bmrDbService'
import { operationsService } from '../operations/operationsService'

const HISTORY_PAGE_SIZE = 20

export default function ProductBatchHistoryTab({ companyId, productId, product, canAllocateNumber = false }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [batches, setBatches] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [allocationPending, setAllocationPending] = useState(false)
  const [allocationError, setAllocationError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const handleAllocate = async (row) => {
    setAllocationPending(true)
    setAllocationError('')
    try {
      if (!(await confirmAction('Allocate the official batch number for this plan?', {
        title: 'Allocate Official Batch Number',
        confirmLabel: 'Allocate Number',
      }))) return
      await allocateBatchNumber(companyId, row.planId, row.planVersion)
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (err) {
      setAllocationError(getErrorMessage(err))
    } finally {
      setAllocationPending(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function fetchAllBatchesForProduct() {
      setLoading(true)
      setError('')
      setPage(1)
      setBatches([])

      try {
        const prodId = Number(productId)
        const prodCode = (product?.code || '').trim().toLowerCase()
        const prodName = (product?.name || '').trim().toLowerCase()

        const backendPlans = []
        if (companyId && prodId) {
          let nextPage = true
          for (let planPage = 1; nextPage && isMounted; planPage += 1) {
            const data = await listBatchPlans(companyId, { product: prodId, page: planPage, page_size: 100 })
            backendPlans.push(...(data.results || []))
            nextPage = Boolean(data.next)
          }
        }
        if (!isMounted) return

        // 2. Fetch Orders with this product
        let matchedOrders = []
        try {
          const allOrders = await operationsService.getOrders()
          const ordersList = Array.isArray(allOrders) ? allOrders : (allOrders?.data || [])
          matchedOrders = ordersList.filter((ord) => {
            const hasProductInLines = (ord.lines || []).some((l) => {
              const lineProdId = l.product?.id || l.product_id || l.productId
              const lineProdCode = (l.product?.code || l.product_code || '').trim().toLowerCase()
              const lineProdName = (l.product?.name || l.product_name || '').trim().toLowerCase()

              if (prodId && lineProdId) return Number(lineProdId) === prodId
              if (prodCode && lineProdCode) return lineProdCode === prodCode
              return Boolean(prodName && lineProdName === prodName)
            })

            const ordProdName = String(ord.product_name || ord.product?.name || ord.product || '').trim().toLowerCase()
            const matchTopLevel = !ord.lines?.length && prodName && ordProdName === prodName

            return (hasProductInLines || matchTopLevel) && (ord.batch_number || ord.batch_no)
          })
        } catch (e) {
          console.warn('[ProductBatchHistory] Orders fetch error:', e?.message)
        }

        // 3. Fetch BMR DB Records
        let bmrRecords = []
        try {
          const allBmrs = await bmrDbService.getAllSavedBmrRecords()
          bmrRecords = (allBmrs || []).filter((b) => {
            const bName = (b.data?.product_name || b.productName || '').trim().toLowerCase()
            const bCode = (b.data?.product_code || b.productCode || '').trim().toLowerCase()
            if (prodCode && bCode) return bCode === prodCode
            return Boolean(prodName && bName === prodName)
          })
        } catch (e) {
          console.warn('[ProductBatchHistory] BMR DB fetch error:', e?.message)
        }

        // 4. Combine and normalize records
        const rowsById = new Map()
        const idsByBatchNo = new Map()
        const batchKey = (number) => String(number).trim().toUpperCase()

        // Normalize Backend Plans
        backendPlans.forEach((p) => {
          const bNo = p.official_batch_number || p.allocated_batch_number || p.batch_number || null
          const id = `plan-${p.id}`
          if (bNo) idsByBatchNo.set(batchKey(bNo), id)
          rowsById.set(id, {
            id,
            planId: p.id,
            planVersion: p.version,
            batchNo: bNo,
            orderRef: p.source_order_reference || p.sales_order_reference || p.order_reference || 'Production Plan',
            customer: p.customer_name || 'Internal Production',
            mfgDate: p.planned_manufacturing_date || p.created_at?.slice(0, 10) || '—',
            quantity: p.target_output_quantity ? `${p.target_output_quantity} ${p.output_uom_code || ''}`.trim() : '—',
            packInfo: p.packing_size_note || (p.planned_pack_quantity ? `${p.planned_pack_quantity} Packs` : '—'),
            revisionNo: p.formula_revision_number ? `Rev ${p.formula_revision_number}` : '—',
            status: (p.official_batch_number || p.allocated_batch_number) ? 'Batch Allocated' : 'Planned',
            qaStatus: p.qa_status || 'Pending QA',
            hasBmr: false,
            bmrType: null,
            source: 'BatchPlan',
          })
        })

        // Normalize Orders
        matchedOrders.forEach((ord) => {
          const bNo = ord.batch_number || ord.batch_no
          if (!bNo) return

          const key = batchKey(bNo)
          const id = idsByBatchNo.get(key) || `ord-${ord.id}-${batchKey(bNo)}`
          const existing = rowsById.get(id) || {}
          idsByBatchNo.set(key, id)
          rowsById.set(id, {
            ...existing,
            id,
            batchNo: bNo,
            orderRef: ord.order_number || ord.reference || existing.orderRef || '—',
            customer: ord.customer_name || ord.customer?.name || existing.customer || '—',
            mfgDate: ord.planned_mfg_date || ord.order_date || existing.mfgDate || '—',
            quantity: ord.target_batch_size || ord.total_quantity || existing.quantity || '—',
            packInfo: ord.pack_size || existing.packInfo || '—',
            revisionNo: ord.revision_number ? `Rev ${ord.revision_number}` : existing.revisionNo || 'Rev 01',
            status: ord.status || existing.status || 'Active',
            qaStatus: ord.qa_status || existing.qaStatus || 'Approved',
            hasBmr: existing.hasBmr || false,
            bmrType: existing.bmrType || null,
            source: 'SalesOrder',
          })
        })

        // Merge BMR records
        bmrRecords.forEach((bmr) => {
          const bNo = bmr.batchNo || bmr.data?.batch_no
          if (!bNo) return

          const key = batchKey(bNo)
          const id = idsByBatchNo.get(key) || `bmr-${batchKey(bNo)}`
          const existing = rowsById.get(id) || {}
          idsByBatchNo.set(key, id)
          rowsById.set(id, {
            ...existing,
            id,
            batchNo: bNo,
            orderRef: existing.orderRef || (bmr.orderId ? `Order #${bmr.orderId}` : 'BMR Master'),
            customer: existing.customer || '—',
            mfgDate: bmr.data?.mfg_date || existing.mfgDate || '—',
            quantity: bmr.data?.batch_size || existing.quantity || '—',
            packInfo: bmr.data?.pack_size || existing.packInfo || '—',
            revisionNo: existing.revisionNo || 'Rev 01',
            status: existing.status || 'In Production',
            qaStatus: existing.qaStatus || 'QA Approved',
            hasBmr: true,
            bmrType: bmr.type || 'drops',
            source: existing.source || 'BMR',
          })
        })

        if (isMounted) {
          // Sort: batches with official batch numbers first, then by batchNo descending
          const sorted = Array.from(rowsById.values()).sort((a, b) => {
            return Number(Boolean(b.batchNo)) - Number(Boolean(a.batchNo)) ||
              String(b.batchNo || '').localeCompare(String(a.batchNo || ''), undefined, { numeric: true }) ||
              (b.planId || 0) - (a.planId || 0)
          })
          setBatches(sorted)
        }
      } catch (err) {
        if (isMounted) {
          setError('Could not load batch history for this product.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchAllBatchesForProduct()

    return () => {
      isMounted = false
    }
  }, [companyId, productId, product, refresh])

  // Filter batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const q = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !q ||
        String(b.batchNo || `PLAN-${b.planId}`).toLowerCase().includes(q) ||
        b.orderRef.toLowerCase().includes(q) ||
        b.customer.toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'QA_APPROVED' && (b.qaStatus?.toLowerCase().includes('approved') || b.status?.toLowerCase().includes('approved'))) ||
        (statusFilter === 'PENDING' && (b.qaStatus?.toLowerCase().includes('pending') || b.status?.toLowerCase().includes('pending') || b.status?.toLowerCase().includes('planned')))

      return matchesSearch && matchesStatus
    })
  }, [batches, searchTerm, statusFilter])

  const totalPages = Math.ceil(filteredBatches.length / HISTORY_PAGE_SIZE)
  const visibleBatches = filteredBatches.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE)

  // Metrics
  const metrics = useMemo(() => {
    const total = batches.length
    const withBmr = batches.filter((b) => b.hasBmr).length
    const approvedCount = batches.filter((b) => (b.qaStatus || '').toLowerCase().includes('approved')).length
    const latestBatch = batches[0]?.batchNo || '—'
    return { total, withBmr, approvedCount, latestBatch }
  }, [batches])

  return (
    <div className="fm-table-section" style={{ marginTop: 16 }}>
      {/* Header & Controls */}
      <div className="fm-table-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📦 Batchwise Manufacturing History</span>
            <span style={{ fontSize: 13, background: '#e0f2fe', color: '#0369a1', padding: '2px 9px', borderRadius: 12, fontWeight: 700 }}>
              {product?.name || 'Product'}
            </span>
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Complete audit trail of all production runs, scheduled batches, and BMR records manufactured with this product's formulation.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search by Batch # or Order…"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            style={{
              padding: '7px 12px',
              fontSize: 13,
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              width: 230,
              outline: 'none',
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            style={{
              padding: '7px 12px',
              fontSize: 13,
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Batches</option>
            <option value="QA_APPROVED">QA Approved Only</option>
            <option value="PENDING">Pending / Planned</option>
          </select>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Batches</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{metrics.total}</div>
        </div>
        <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>QA Certified</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginTop: 2 }}>{metrics.approvedCount}</div>
        </div>
        <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>BMR Issued</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>{metrics.withBmr}</div>
        </div>
        <div style={{ background: '#faf5ff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e9d5ff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase' }}>Latest Batch</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#6b21a8', marginTop: 4 }}>{metrics.latestBatch}</div>
        </div>
      </div>

      {error && <Alert type="error" style={{ marginBottom: 14 }}>{error}</Alert>}
      {allocationError && <Alert type="error">{allocationError}</Alert>}

      {/* Table */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" label="Loading product batch history…" />
        </div>
      ) : filteredBatches.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1.5px dashed #cbd5e1',
          margin: '12px 0'
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
          <h5 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            No Batches Found
          </h5>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            {searchTerm || statusFilter !== 'ALL'
              ? 'No batches match your filter criteria. Try clearing the search term.'
              : `No production batches have been manufactured or planned for ${product?.name || 'this product'} yet.`}
          </p>
        </div>
      ) : (
        <div className="fm-table-scroll">
          <table className="fm-history-table">
            <thead>
              <tr>
                <th>Batch No.</th>
                <th>Order / Reference</th>
                <th>Client / Destination</th>
                <th>Mfg Date</th>
                <th>Target Quantity</th>
                <th>Formula Rev</th>
                <th>QA Status</th>
                <th>BMR Trace</th>
              </tr>
            </thead>
            <tbody>
              {visibleBatches.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: '#f0f9ff',
                      color: '#0369a1',
                      border: '1px solid #bae6fd',
                      fontWeight: 700,
                      fontSize: 13,
                    }}>
                      {row.batchNo || 'Not allocated'}
                    </span>
                    {!row.batchNo && row.planId && canAllocateNumber && (
                      <div style={{ marginTop: 6 }}>
                        <Button type="button" size="sm" variant="secondary" disabled={allocationPending}
                          onClick={() => handleAllocate(row)}>
                          Allocate Number
                        </Button>
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, color: '#334155' }}>
                    {row.orderRef}
                  </td>
                  <td style={{ color: '#475569' }}>
                    {row.customer}
                  </td>
                  <td style={{ color: '#64748b' }}>
                    {row.mfgDate}
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#0f766e' }}>
                      {row.quantity}
                    </span>
                    {row.packInfo && row.packInfo !== '—' && (
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                        {row.packInfo}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: '#f1f5f9',
                      color: '#475569',
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {row.revisionNo}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      background: (row.qaStatus || '').toLowerCase().includes('approved') ? '#dcfce7' : '#fef3c7',
                      color: (row.qaStatus || '').toLowerCase().includes('approved') ? '#15803d' : '#b45309',
                    }}>
                      {(row.qaStatus || '').toLowerCase().includes('approved') ? '✓ Approved' : '⏳ Review'}
                    </span>
                  </td>
                  <td>
                    {row.hasBmr ? (
                      <Link
                        to="/bmr-records"
                        className="table-edit"
                        style={{ padding: '3px 10px', fontSize: 11 }}
                      >
                        📋 View BMR
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>No BMR Record</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && totalPages > 1 && (
        <div className="ci-pagination">
          <Button type="button" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {totalPages}</span>
          <Button type="button" variant="secondary" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
