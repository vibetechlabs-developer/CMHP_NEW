// Common Material Purchasing - Shared Store Procurement & Receiving Hub
// 1. Supplier Purchase Orders (shared store procurement)
// 2. Inward Goods Receipts (goods delivery into common warehouse)
// 3. Material Requests (production demand linked to batches)
import { useEffect, useState } from 'react'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import { LoadingState } from '../../../components/Spinner'
import Modal from '../components/Modal'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { getErrorMessage } from '../../../utils/errors'
import useAuth from '../../../hooks/useAuth'
import useWorkspace from '../../../hooks/useWorkspace'
import { getMyStores, listMyCompanies } from '../../store/storeService'
import {
  listMaterialRequisitions,
  getMaterialRequisition,
  submitMaterialRequisition,
  approveMaterialRequisition,
  rejectMaterialRequisition,
  reviseMaterialRequisition,
} from '../../manufacturing/materialRequisitionsService'
import {
  listStorePurchaseOrders,
  listStorePurchasingSuppliers,
  listPurchaseOrders,
  getPurchaseOrder,
  updateStorePurchaseOrder,
  updatePurchaseOrder,
  issueStorePurchaseOrder,
  cancelStorePurchaseOrder,
  issuePurchaseOrder,
  cancelPurchaseOrder,
  listPurchasingSuppliers,
} from '../purchasingService'
import {
  listGoodsReceipts,
  getGoodsReceipt,
  postGoodsReceipt,
  cancelGoodsReceipt,
} from '../../store/receivingService'
import InwardStockModal from '../../store/InwardStockModal'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import { getAvailableToIssue } from '../../store/materialIssueService'
import PurchaseOrderModal from '../components/PurchaseOrderModal'
import './CommonInventory.css'

const STATUS_COLORS = {
  DRAFT: { bg: '#f1f5f9', color: '#475569' },
  SUBMITTED: { bg: '#e0f2fe', color: '#0369a1' },
  APPROVED: { bg: '#dcfce7', color: '#15803d' },
  ISSUED: { bg: '#ede9fe', color: '#6d28d9' },
  POSTED: { bg: '#dcfce7', color: '#15803d' },
  REJECTED: { bg: '#fee2e2', color: '#b91c1c' },
  CANCELLED: { bg: '#fee2e2', color: '#b91c1c' },
  REVISED: { bg: '#fef3c7', color: '#b45309' },
  PENDING: { bg: '#fef3c7', color: '#b45309' },
  PARTIAL: { bg: '#e0f2fe', color: '#0369a1' },
  COMPLETED: { bg: '#dcfce7', color: '#15803d' },
}

export default function CommonOrdersTab({ storeId: propStoreId }) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const { confirm, prompt, ConfirmNode } = useConfirmDialog()

  // Primary tabs: 'PURCHASE_ORDERS' (default) | 'INWARD_RECEIPTS' | 'REQUISITIONS'
  const [activeSubtab, setActiveSubtab] = useState('PURCHASE_ORDERS')

  // Shared store and company resolution
  const [stores, setStores] = useState([])
  const [storeId, setStoreId] = useState(propStoreId || null)
  const [currentStore, setCurrentStore] = useState(null)
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState(activeWorkspace?.companyId || null)

  // 1. Supplier Purchase Orders state
  const [pos, setPos] = useState({ loading: true, results: [], count: 0, error: '' })
  const [poSearch, setPoSearch] = useState('')
  const [poSupplier, setPoSupplier] = useState('')
  const [poStatus, setPoStatus] = useState('')
  const [poDateFrom, setPoDateFrom] = useState('')
  const [poDateTo, setPoDateTo] = useState('')
  const [poPage, setPoPage] = useState(1)
  const [supplierOptions, setSupplierOptions] = useState([])

  // 2. Inward Goods Receipts state
  const [receipts, setReceipts] = useState({ loading: true, results: [], count: 0, error: '' })
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptStatus, setReceiptStatus] = useState('')
  const [receiptPage, setReceiptPage] = useState(1)

  // 3. Production Material Requests state
  const [reqs, setReqs] = useState({ loading: true, results: [], count: 0, error: '' })
  const [reqSearch, setReqSearch] = useState('')
  const [reqStatus, setReqStatus] = useState('')
  const [reqPage, setReqPage] = useState(1)

  // Modals & Action states
  const [selectedPo, setSelectedPo] = useState(null)
  const [poDetailOpen, setPoDetailOpen] = useState(false)
  const [isCreatePoOpen, setIsCreatePoOpen] = useState(false)
  const [editingPo, setEditingPo] = useState(null)

  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [receiptDetailOpen, setReceiptDetailOpen] = useState(false)
  const [inwardOpen, setInwardOpen] = useState(false)
  const [inwardPrefillPo, setInwardPrefillPo] = useState(null)
  const [editingDraftReceipt, setEditingDraftReceipt] = useState(null)

  const [selectedReq, setSelectedReq] = useState(null)
  const [reqDetailOpen, setReqDetailOpen] = useState(false)
  const [reqBalances, setReqBalances] = useState({})
  const [reqBalancesLoading, setReqBalancesLoading] = useState(false)
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [issuePrefill, setIssuePrefill] = useState(null)

  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Initial resolution of stores and companies
  useEffect(() => {
    getMyStores()
      .then((list) => {
        setStores(list || [])
        if (list && list.length > 0) {
          const selected = propStoreId
            ? list.find((s) => s.id === Number(propStoreId)) || list[0]
            : list[0]
          setStoreId(selected.id)
          setCurrentStore(selected)
        }
      })
      .catch(() => {})

    listMyCompanies()
      .then((list) => {
        setCompanies(list || [])
        if (!companyId && list && list.length > 0) {
          setCompanyId(list[0].id)
        }
      })
      .catch(() => {})
  }, [propStoreId, companyId])

  // Load supplier lookup for filters
  useEffect(() => {
    if (!storeId) return
    listStorePurchasingSuppliers(storeId)
      .then((data) => setSupplierOptions(data || []))
      .catch(() => {})
  }, [storeId])

  // Clear notices after 5 seconds
  useEffect(() => {
    if (actionSuccess || actionError) {
      const timer = setTimeout(() => {
        setActionSuccess('')
        setActionError('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [actionSuccess, actionError])

  // -------------------------------------------------------------
  // TAB 1: FETCH PURCHASE ORDERS (Common Store Scoped)
  // -------------------------------------------------------------
  const loadPurchaseOrders = () => {
    if (!storeId && !companyId) return
    setPos((prev) => ({ ...prev, loading: true, error: '' }))

    const fetcher = storeId
      ? listStorePurchaseOrders(storeId, {
          page: poPage,
          pageSize: 20,
          status: poStatus,
          search: poSearch,
          supplierId: poSupplier,
          dateFrom: poDateFrom,
          dateTo: poDateTo,
        })
      : listPurchaseOrders(companyId, {
          page: poPage,
          pageSize: 20,
          status: poStatus,
          search: poSearch,
        })

    fetcher
      .then((data) => {
        setPos({
          loading: false,
          results: data.results || [],
          count: data.count || 0,
          error: '',
        })
      })
      .catch((err) => {
        // Fallback to company-scoped PO list if store facade had an unexpected error
        if (storeId && companyId) {
          listPurchaseOrders(companyId, { page: poPage, pageSize: 20, status: poStatus, search: poSearch })
            .then((data) => {
              setPos({
                loading: false,
                results: data.results || [],
                count: data.count || 0,
                error: '',
              })
            })
            .catch((e) => {
              setPos({ loading: false, results: [], count: 0, error: getErrorMessage(e) })
            })
        } else {
          setPos({ loading: false, results: [], count: 0, error: getErrorMessage(err) })
        }
      })
  }

  useEffect(() => {
    if (activeSubtab === 'PURCHASE_ORDERS') {
      loadPurchaseOrders()
    }
  }, [storeId, poPage, poStatus, poSupplier, poDateFrom, poDateTo, activeSubtab])

  const handleClearPoFilters = () => {
    setPoSearch('')
    setPoSupplier('')
    setPoStatus('')
    setPoDateFrom('')
    setPoDateTo('')
    setPoPage(1)
  }

  // -------------------------------------------------------------
  // TAB 2: FETCH INWARD GOODS RECEIPTS
  // -------------------------------------------------------------
  const loadGoodsReceipts = () => {
    if (!storeId) return
    setReceipts((prev) => ({ ...prev, loading: true, error: '' }))
    listGoodsReceipts(storeId, { status: receiptStatus, page: receiptPage, pageSize: 20, search: receiptSearch })
      .then((data) => {
        setReceipts({
          loading: false,
          results: Array.isArray(data) ? data : data?.results || [],
          count: data?.count || (Array.isArray(data) ? data.length : 0),
          error: '',
        })
      })
      .catch((err) => {
        setReceipts({ loading: false, results: [], count: 0, error: getErrorMessage(err) })
      })
  }

  useEffect(() => {
    if (activeSubtab === 'INWARD_RECEIPTS') {
      loadGoodsReceipts()
    }
  }, [storeId, receiptPage, receiptStatus, activeSubtab])

  // -------------------------------------------------------------
  // TAB 3: FETCH MATERIAL REQUESTS
  // -------------------------------------------------------------
  const loadRequisitions = () => {
    if (!storeId) return
    setReqs((prev) => ({ ...prev, loading: true, error: '' }))
    listMaterialRequisitions(storeId, { page: reqPage, pageSize: 20 })
      .then((data) => {
        let results = Array.isArray(data) ? data : data.results || []
        if (reqStatus) {
          results = results.filter((r) => String(r.status || '').toUpperCase() === reqStatus.toUpperCase())
        }
        if (reqSearch) {
          const s = reqSearch.toLowerCase()
          results = results.filter((r) => {
            const ref = String(r.reference || `REQ-#${r.id}`).toLowerCase()
            const prod = String(r.product_name_snapshot || r.product_code_snapshot || '').toLowerCase()
            const batch = String(
              r.current_plan_context?.official_batch_number || r.batch_plan_number || r.batch_plan || ''
            ).toLowerCase()
            return ref.includes(s) || prod.includes(s) || batch.includes(s)
          })
        }
        setReqs({
          loading: false,
          results,
          count: data.count || (Array.isArray(data) ? data.length : results.length),
          error: '',
        })
      })
      .catch((err) => {
        setReqs({ loading: false, results: [], count: 0, error: getErrorMessage(err) })
      })
  }

  useEffect(() => {
    if (activeSubtab === 'REQUISITIONS') {
      loadRequisitions()
    }
  }, [storeId, reqPage, reqStatus, activeSubtab])

  // -------------------------------------------------------------
  // ACTIONS: PURCHASE ORDERS
  // -------------------------------------------------------------
  const handleIssuePo = async (po) => {
    let targetPo = po
    const todayStr = new Date().toISOString().slice(0, 10)
    let deliveryDate = po.expected_delivery_date

    // If expected delivery date is missing or in the past, prompt user to set it
    if (!deliveryDate || deliveryDate < todayStr) {
      const defaultDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const inputDate = await prompt({
        title: 'Set Expected Delivery Date',
        message: `An Expected Delivery Date is required by the supplier before issuing ${po.reference || `#${po.id}`}.\n\nPlease confirm expected delivery date (YYYY-MM-DD):`,
        defaultValue: defaultDate,
        placeholder: defaultDate,
        confirmLabel: 'Set Date & Issue',
        cancelLabel: 'Cancel',
      })
      if (!inputDate) return
      const chosenDate = inputDate.trim() || defaultDate
      if (chosenDate < todayStr) {
        setActionError('Expected delivery date cannot be in the past.')
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      setActionLoading(true)
      setActionError('')
      try {
        if (storeId) {
          targetPo = await updateStorePurchaseOrder(storeId, po.id, {
            expected_delivery_date: chosenDate,
            expected_version: po.version,
          })
        } else {
          targetPo = await updatePurchaseOrder(po.company_id || companyId, po.id, {
            expected_delivery_date: chosenDate,
            expected_version: po.version,
          })
        }
      } catch (err) {
        setActionError(getErrorMessage(err))
        loadPurchaseOrders()
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setActionLoading(false)
        return
      }
    } else {
      const ok = await confirm({
        title: 'Issue Purchase Order',
        message: `Send purchase order ${po.reference || `#${po.id}`} to supplier ${po.supplier_name || po.supplier_code || ''}?\n\nOnce issued it cannot be edited.`,
        confirmLabel: 'Issue to Supplier',
        cancelLabel: 'Go Back',
        variant: 'primary',
        icon: '📤',
      })
      if (!ok) return
    }

    setActionLoading(true)
    setActionError('')
    try {
      if (storeId) {
        try {
          await issueStorePurchaseOrder(storeId, targetPo.id, targetPo.version)
        } catch (err) {
          if (err?.response?.status === 404 && (targetPo.company_id || companyId)) {
            await issuePurchaseOrder(targetPo.company_id || companyId, targetPo.id, targetPo.version)
          } else {
            throw err
          }
        }
      } else {
        await issuePurchaseOrder(targetPo.company_id || companyId, targetPo.id, targetPo.version)
      }
      setActionSuccess(`Purchase Order ${targetPo.reference || targetPo.id} issued to supplier.`)
      loadPurchaseOrders()
      setPoDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
      loadPurchaseOrders()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelPo = async (po) => {
    const reason = await prompt({
      title: 'Cancel Purchase Order',
      message: `Enter the reason for cancelling ${po.reference || `#${po.id}`}. This action cannot be undone.`,
      placeholder: 'e.g. Supplier unavailable, price changed...',
      confirmLabel: 'Cancel Order',
      cancelLabel: 'Go Back',
      variant: 'danger',
    })
    if (!reason) return
    setActionLoading(true)
    setActionError('')
    try {
      if (storeId) {
        try {
          await cancelStorePurchaseOrder(storeId, po.id, po.version, reason)
        } catch {
          await cancelPurchaseOrder(po.company_id || companyId, po.id, po.version, reason)
        }
      } else {
        await cancelPurchaseOrder(po.company_id || companyId, po.id, po.version, reason)
      }
      setActionSuccess(`Purchase Order ${po.reference || po.id} cancelled.`)
      loadPurchaseOrders()
      setPoDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
      loadPurchaseOrders()
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenReceive = (po) => {
    setInwardPrefillPo(po)
    setEditingDraftReceipt(null)
    setInwardOpen(true)
  }

  // -------------------------------------------------------------
  // ACTIONS: INWARD GOODS RECEIPTS
  // -------------------------------------------------------------
  const handlePostReceipt = async (receipt) => {
    const ok = await confirm({
      title: 'Post Goods Receipt',
      message: `Post receipt ${receipt.reference || `#${receipt.id}`} to inventory?\n\nStock will increase immediately. This cannot be undone.`,
      confirmLabel: '✅ Post to Inventory',
      cancelLabel: 'Go Back',
      variant: 'primary',
      icon: '📥',
    })
    if (!ok) return
    setActionLoading(true)
    setActionError('')
    try {
      await postGoodsReceipt(storeId, receipt.id, receipt.version)
      setActionSuccess(`Goods receipt ${receipt.reference || receipt.id} posted — stock updated!`)
      loadGoodsReceipts()
      loadPurchaseOrders()
      if (receiptDetailOpen) setReceiptDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelReceipt = async (receipt) => {
    const reason = await prompt({
      title: 'Cancel Goods Receipt',
      message: `Enter reason for cancelling draft receipt ${receipt.reference || `#${receipt.id}`}.`,
      placeholder: 'e.g. Wrong quantity entered, duplicate...',
      confirmLabel: 'Cancel Receipt',
      cancelLabel: 'Go Back',
      variant: 'danger',
    })
    if (!reason) return
    setActionLoading(true)
    setActionError('')
    try {
      await cancelGoodsReceipt(storeId, receipt.id, receipt.version, reason)
      setActionSuccess(`Goods receipt ${receipt.reference || receipt.id} cancelled.`)
      loadGoodsReceipts()
      if (receiptDetailOpen) setReceiptDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleEditReceiptDraft = (receipt) => {
    setEditingDraftReceipt(receipt)
    setInwardPrefillPo(null)
    setInwardOpen(true)
  }

  // -------------------------------------------------------------
  // ACTIONS: MATERIAL REQUESTS
  // -------------------------------------------------------------
  const handleSubmitReq = async (req) => {
    const ok = await confirm({
      title: 'Submit for Approval',
      message: `Submit material request ${req.reference || `#${req.id}`} for approval?`,
      confirmLabel: 'Submit',
      cancelLabel: 'Go Back',
      variant: 'primary',
      icon: '📋',
    })
    if (!ok) return
    setActionLoading(true)
    setActionError('')
    try {
      await submitMaterialRequisition(storeId, req.id, req.version)
      setActionSuccess(`Request ${req.reference || req.id} submitted for approval.`)
      loadRequisitions()
      setReqDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveReq = async (req) => {
    const ok = await confirm({
      title: 'Approve Material Request',
      message: `Approve request ${req.reference || `#${req.id}`}? Once approved, materials can be issued to production.`,
      confirmLabel: '✅ Approve',
      cancelLabel: 'Go Back',
      variant: 'primary',
      icon: '✅',
    })
    if (!ok) return
    setActionLoading(true)
    setActionError('')
    try {
      await approveMaterialRequisition(storeId, req.id, req.version)
      setActionSuccess(`Request ${req.reference || req.id} approved.`)
      loadRequisitions()
      setReqDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectReq = async (req) => {
    const reason = await prompt({
      title: 'Reject Material Request',
      message: `Enter reason for rejecting request ${req.reference || `#${req.id}`}.`,
      placeholder: 'e.g. Insufficient stock, formula changed...',
      confirmLabel: 'Reject',
      cancelLabel: 'Go Back',
      variant: 'danger',
    })
    if (!reason) return
    setActionLoading(true)
    setActionError('')
    try {
      await rejectMaterialRequisition(storeId, req.id, req.version, reason)
      setActionSuccess(`Request ${req.reference || req.id} rejected.`)
      loadRequisitions()
      setReqDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleReviseReq = async (req) => {
    const ok = await confirm({
      title: 'Revise Request',
      message: `Reopen rejected request ${req.reference || `#${req.id}`} for revision?`,
      confirmLabel: '🔄 Revise',
      cancelLabel: 'Go Back',
      variant: 'warning',
      icon: '🔄',
    })
    if (!ok) return
    setActionLoading(true)
    setActionError('')
    try {
      await reviseMaterialRequisition(storeId, req.id, req.version)
      setActionSuccess(`Request ${req.reference || req.id} reopened for revision.`)
      loadRequisitions()
      setReqDetailOpen(false)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const getRequisitionLines = (req) => {
    if (!req) return []
    if (Array.isArray(req.lines) && req.lines.length > 0) return req.lines
    const raw = Array.isArray(req.raw_lines) ? req.raw_lines : []
    const pkg = Array.isArray(req.packaging_lines) ? req.packaging_lines : []
    return [...raw, ...pkg]
  }

  const handleOpenReqDetails = async (req) => {
    setSelectedReq(req)
    setReqDetailOpen(true)
    if (storeId && req.id) {
      try {
        const full = await getMaterialRequisition(storeId, req.id)
        if (full) setSelectedReq(full)
      } catch {
        // keep req as fallback
      }
    }
  }

  useEffect(() => {
    if (!reqDetailOpen || !selectedReq || !storeId) {
      setReqBalances({})
      return
    }
    const lines = getRequisitionLines(selectedReq)
    if (lines.length === 0) return

    setReqBalancesLoading(true)
    let isCancelled = false
    Promise.all(
      lines.map((line) => {
        const matId = line.material_id || line.material
        if (!matId) return Promise.resolve([line.id || line.line_number, []])
        return getAvailableToIssue(storeId, matId)
          .then((rows) => [line.id || line.line_number, rows || []])
          .catch(() => [line.id || line.line_number, []])
      })
    )
      .then((entries) => {
        if (!isCancelled) {
          setReqBalances(Object.fromEntries(entries))
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setReqBalancesLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [reqDetailOpen, selectedReq, storeId])

  const handleOpenIssue = (req, line = null) => {
    const lines = getRequisitionLines(req)
    const activeLine = line || (lines.length > 0 ? lines[0] : null)
    setIssuePrefill({
      materialId: activeLine?.material_id || activeLine?.material,
      materialCode: activeLine?.material_code_snapshot || activeLine?.material_code,
      materialName: activeLine?.material_name_snapshot || activeLine?.material_name,
      initialBatchReference:
        req.current_plan_context?.official_batch_number || (req.batch_plan ? `#${req.batch_plan}` : ''),
      initialProductReference: req.product_name_snapshot || req.product_code_snapshot || '',
      initialQuantity: activeLine?.requested_quantity || '',
      initialCompanyId: req.company_id,
    })
    setIssueModalOpen(true)
  }

  const storeDisplayName = currentStore?.name || (storeId ? `Shared Store #${storeId}` : 'Shared Warehouse')

  return (
    <div className="ci-container">
      {/* 1. Subtabs Navigation Bar */}
      <div className="ci-nav-bar">
        <div className="ci-subtabs">
          <button
            type="button"
            className={`ci-subtab-btn ${activeSubtab === 'PURCHASE_ORDERS' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('PURCHASE_ORDERS')}
          >
            🛒 Purchase Orders
            {pos.count > 0 && <span className="ci-subtab-count">{pos.count}</span>}
          </button>
          <button
            type="button"
            className={`ci-subtab-btn ${activeSubtab === 'INWARD_RECEIPTS' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('INWARD_RECEIPTS')}
          >
            📥 Inward Receipts
            {receipts.count > 0 && <span className="ci-subtab-count">{receipts.count}</span>}
          </button>
          <button
            type="button"
            className={`ci-subtab-btn ${activeSubtab === 'REQUISITIONS' ? 'active' : ''}`}
            onClick={() => setActiveSubtab('REQUISITIONS')}
          >
            📋 Material Requests
            {reqs.count > 0 && <span className="ci-subtab-count">{reqs.count}</span>}
          </button>
        </div>

      </div>

      {(actionSuccess || actionError) && (
        <div style={{ position: 'sticky', top: 10, zIndex: 90, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {actionSuccess && <Alert type="success">{actionSuccess}</Alert>}
          {actionError && (
            <Alert type="error">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setActionError('')
                    loadPurchaseOrders()
                  }}
                  style={{
                    background: '#b91c1c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔄 Refresh Orders List
                </button>
              </div>
            </Alert>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 1: SUPPLIER PURCHASE ORDERS (DEFAULT)                     */}
      {/* ============================================================= */}
      {activeSubtab === 'PURCHASE_ORDERS' && (
        <div>
          {/* Section Heading & Create Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Supplier Purchase Orders
            </h3>
            <Button
              variant="primary"
              onClick={() => {
                setEditingPo(null)
                setIsCreatePoOpen(true)
              }}
            >
              + Create Purchase Order
            </Button>
          </div>

          {/* One Compact Filter Row */}
          <div
            className="ci-filters"
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Search PO / Supplier */}
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                className="ci-input"
                placeholder="Search PO # / supplier..."
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPoPage(1)
                    loadPurchaseOrders()
                  }
                }}
                style={{ minWidth: 200, padding: '5px 8px', fontSize: 13 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPoPage(1)
                  loadPurchaseOrders()
                }}
              >
                🔍
              </Button>
            </div>

            {/* Supplier Filter */}
            <select
              className="ci-select"
              value={poSupplier}
              onChange={(e) => {
                setPoSupplier(e.target.value)
                setPoPage(1)
              }}
              style={{ minWidth: 150, width: 'auto', fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Suppliers</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.display_name || s.code}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="ci-select"
              value={poStatus}
              onChange={(e) => {
                setPoStatus(e.target.value)
                setPoPage(1)
              }}
              style={{ minWidth: 120, width: 'auto', fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {/* Date Range: From & To */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569' }}>
              <span>From:</span>
              <input
                type="date"
                className="ci-input"
                value={poDateFrom}
                onChange={(e) => {
                  setPoDateFrom(e.target.value)
                  setPoPage(1)
                }}
                style={{ width: 'auto', fontSize: 12, padding: '4px 6px' }}
              />
              <span>To:</span>
              <input
                type="date"
                className="ci-input"
                value={poDateTo}
                onChange={(e) => {
                  setPoDateTo(e.target.value)
                  setPoPage(1)
                }}
                style={{ width: 'auto', fontSize: 12, padding: '4px 6px' }}
              />
            </div>

            {/* Clear & Refresh */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(poSearch || poSupplier || poStatus || poDateFrom || poDateTo) && (
                <Button size="sm" variant="secondary" onClick={handleClearPoFilters}>
                  Clear
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={loadPurchaseOrders} disabled={pos.loading}>
                {pos.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {pos.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading supplier purchase orders..." />
            </div>
          ) : pos.error ? (
            <Alert type="error">{pos.error}</Alert>
          ) : pos.results.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
              <h3>No Purchase Orders Found</h3>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 460, margin: '0 auto 16px' }}>
                Purchase orders record contracted supplier material rates and expected deliveries into the shared store.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setEditingPo(null)
                  setIsCreatePoOpen(true)
                }}
              >
                + Create Purchase Order
              </Button>
            </div>
          ) : (
            <>
              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>PO No.</th>
                      <th style={{ minWidth: 95 }}>Date</th>
                      <th style={{ minWidth: 140 }}>Supplier</th>
                      <th style={{ minWidth: 180 }}>Material / Lines</th>
                      <th style={{ minWidth: 120 }}>Expected Delivery</th>
                      <th style={{ minWidth: 140 }}>Receipt Progress</th>
                      <th style={{ minWidth: 90 }}>Status</th>
                      <th className="ci-actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.results.map((po) => {
                      const st = String(po.status || '').toUpperCase()
                      const stStyle = STATUS_COLORS[st] || { bg: '#f1f5f9', color: '#475569' }
                      const prog = Array.isArray(po.delivery_progress) ? po.delivery_progress : []
                      const isComplete = prog.length > 0 && prog.every((p) => p.delivery_status === 'COMPLETED')
                      const isPartial = prog.length > 0 && prog.some((p) => Number(p.received_quantity) > 0)
                      const progStatus = isComplete ? 'COMPLETED' : isPartial ? 'PARTIAL' : 'PENDING'
                      const progStyle = STATUS_COLORS[progStatus] || STATUS_COLORS.PENDING

                      // Lines summary - display each line's material and qty/unit WITHOUT summing different units!
                      const linesList = Array.isArray(po.lines) ? po.lines : []
                      const linesSummary = linesList.length > 0 ? (
                        <div style={{ fontSize: 12 }}>
                          {linesList.slice(0, 2).map((l, idx) => (
                            <div key={idx} style={{ color: '#334155' }}>
                              <strong>{l.material_code || l.material_name || `Item #${l.material_id}`}</strong>: {l.ordered_quantity || l.quantity} {l.unit_code || ''}
                            </div>
                          ))}
                          {linesList.length > 2 && (
                            <div style={{ color: '#64748b', fontSize: 11 }}>
                              +{linesList.length - 2} more item(s)
                            </div>
                          )}
                          <div style={{ color: '#0369a1', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                            Total: {po.currency_code || '₹'} {po.subtotal || '-'}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                      )

                      return (
                        <tr key={po.id}>
                          <td>
                            <strong>{po.reference || `PO-#${po.id}`}</strong>
                            {po.company_code && (
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                Bill to: {po.company_code}
                              </div>
                            )}
                          </td>
                          <td>{(po.created_at || '').slice(0, 10)}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {po.supplier_name || po.supplier?.name || po.supplier?.display_name || po.supplier_code || `Supplier #${po.supplier_id || '-'}`}
                            </div>
                          </td>
                          <td>{linesSummary}</td>
                          <td>{po.expected_delivery_date || '-'}</td>
                          <td>
                            {st === 'ISSUED' ? (
                              <div>
                                <span
                                  className="stock-badge"
                                  style={{ background: progStyle.bg, color: progStyle.color, border: 'none' }}
                                >
                                  {progStatus === 'COMPLETED' ? '✓ Fully Received' : progStatus === 'PARTIAL' ? '⚡ Partial Received' : '⏳ Pending Delivery'}
                                </span>
                                {prog.length > 0 && (
                                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                                    {prog.filter((p) => p.delivery_status === 'COMPLETED').length}/{prog.length} lines completed
                                  </div>
                                )}
                              </div>
                            ) : st === 'DRAFT' ? (
                              <span style={{ color: '#64748b', fontSize: 12 }}>Draft (Not Issued)</span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="stock-badge"
                              style={{ background: stStyle.bg, color: stStyle.color, border: 'none' }}
                            >
                              {st}
                            </span>
                          </td>
                          <td className="ci-actions-col">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedPo(po)
                                  setPoDetailOpen(true)
                                }}
                              >
                                Details
                              </Button>
                              {st === 'DRAFT' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setEditingPo(po)
                                      setIsCreatePoOpen(true)
                                    }}
                                    disabled={actionLoading}
                                  >
                                    ✏️ Edit
                                  </Button>
                                  <Button
                                    id={`issue-po-btn-${po.id}`}
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleIssuePo(po)}
                                    disabled={actionLoading}
                                  >
                                    Issue
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleCancelPo(po)}
                                    disabled={actionLoading}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                              {st === 'ISSUED' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  style={{ background: '#0284c7', borderColor: '#0284c7' }}
                                  onClick={() => handleOpenReceive(po)}
                                >
                                  📥 Receive
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Server Pagination */}
              {pos.count > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    Showing {(poPage - 1) * 20 + 1} &ndash; {Math.min(poPage * 20, pos.count)} of {pos.count} orders
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={poPage <= 1 || pos.loading}
                      onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                    >
                      &larr; Previous
                    </Button>
                    <span style={{ padding: '0 8px', fontWeight: 600 }}>
                      Page {poPage} of {Math.ceil(pos.count / 20) || 1}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={poPage * 20 >= pos.count || pos.loading}
                      onClick={() => setPoPage((p) => p + 1)}
                    >
                      Next &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: INWARD RECEIPTS                                        */}
      {/* ============================================================= */}
      {activeSubtab === 'INWARD_RECEIPTS' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Inward Goods Receipts
            </h3>
            <Button
              variant="primary"
              onClick={() => {
                setInwardPrefillPo(null)
                setEditingDraftReceipt(null)
                setInwardOpen(true)
              }}
            >
              + Create Inward Receipt
            </Button>
          </div>

          <div
            className="ci-filters"
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                className="ci-input"
                placeholder="Search receipt # / PO / invoice..."
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setReceiptPage(1)
                    loadGoodsReceipts()
                  }
                }}
                style={{ minWidth: 220, padding: '5px 8px', fontSize: 13 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setReceiptPage(1)
                  loadGoodsReceipts()
                }}
              >
                🔍
              </Button>
            </div>

            <select
              className="ci-select"
              value={receiptStatus}
              onChange={(e) => {
                setReceiptStatus(e.target.value)
                setReceiptPage(1)
              }}
              style={{ minWidth: 130, width: 'auto', fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(receiptSearch || receiptStatus) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReceiptSearch('')
                    setReceiptStatus('')
                    setReceiptPage(1)
                  }}
                >
                  Clear
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={loadGoodsReceipts} disabled={receipts.loading}>
                {receipts.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {receipts.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading inward goods receipts..." />
            </div>
          ) : receipts.error ? (
            <Alert type="error">{receipts.error}</Alert>
          ) : receipts.results.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
              <h3>No Goods Receipts Found</h3>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
                Goods receipts record arriving materials from suppliers against issued purchase orders into the common store.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setInwardPrefillPo(null)
                  setEditingDraftReceipt(null)
                  setInwardOpen(true)
                }}
              >
                + Create Inward Receipt
              </Button>
            </div>
          ) : (
            <>
              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>Receipt Ref</th>
                      <th style={{ minWidth: 130 }}>Source PO</th>
                      <th style={{ minWidth: 140 }}>Supplier / Buyer</th>
                      <th style={{ minWidth: 110 }}>Store</th>
                      <th style={{ minWidth: 95 }}>Arrived At</th>
                      <th style={{ minWidth: 140 }}>Invoice / Delivery Ref</th>
                      <th style={{ minWidth: 90 }}>Status</th>
                      <th style={{ minWidth: 60 }}>Lines</th>
                      <th className="ci-actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.results.map((r) => {
                      const st = String(r.status || '').toUpperCase()
                      const stStyle = STATUS_COLORS[st] || { bg: '#f1f5f9', color: '#475569' }
                      const poRef = r.source_purchase_order_reference || (r.source_purchase_order_id ? `PO #${r.source_purchase_order_id}` : 'Direct Entry')
                      const supplier = r.supplier_name || r.company_code || '-'
                      const invoiceRef = r.supplier_invoice_reference || r.delivery_note_reference || '-'
                      const dateStr = r.arrived_at ? r.arrived_at.slice(0, 10) : (r.created_at || '').slice(0, 10)

                      return (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.reference || `GR-#${r.id}`}</strong>
                          </td>
                          <td>
                            <strong>{poRef}</strong>
                          </td>
                          <td>{supplier}</td>
                          <td>{r.store_code || storeDisplayName}</td>
                          <td>{dateStr}</td>
                          <td>{invoiceRef}</td>
                          <td>
                            <span
                              className="stock-badge"
                              style={{ background: stStyle.bg, color: stStyle.color, border: 'none' }}
                            >
                              {st}
                            </span>
                          </td>
                          <td>{Array.isArray(r.lines) ? r.lines.length : '-'}</td>
                          <td className="ci-actions-col">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedReceipt(r)
                                  setReceiptDetailOpen(true)
                                }}
                              >
                                Details
                              </Button>
                              {st === 'DRAFT' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleEditReceiptDraft(r)}
                                    disabled={actionLoading}
                                  >
                                    ✏️ Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    style={{ background: '#16a34a', borderColor: '#16a34a' }}
                                    onClick={() => handlePostReceipt(r)}
                                    disabled={actionLoading}
                                  >
                                    ✅ Post
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleCancelReceipt(r)}
                                    disabled={actionLoading}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {receipts.count > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    Showing {(receiptPage - 1) * 20 + 1} &ndash; {Math.min(receiptPage * 20, receipts.count)} of {receipts.count} receipts
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={receiptPage <= 1 || receipts.loading}
                      onClick={() => setReceiptPage((p) => Math.max(1, p - 1))}
                    >
                      &larr; Previous
                    </Button>
                    <span style={{ padding: '0 8px', fontWeight: 600 }}>
                      Page {receiptPage} of {Math.ceil(receipts.count / 20) || 1}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={receiptPage * 20 >= receipts.count || receipts.loading}
                      onClick={() => setReceiptPage((p) => p + 1)}
                    >
                      Next &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: PRODUCTION MATERIAL REQUESTS                           */}
      {/* ============================================================= */}
      {activeSubtab === 'REQUISITIONS' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Production Material Requests
            </h3>
          </div>

          <div
            className="ci-filters"
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                className="ci-input"
                placeholder="Search req #, product, batch..."
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setReqPage(1)
                    loadRequisitions()
                  }
                }}
                style={{ minWidth: 220, padding: '5px 8px', fontSize: 13 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setReqPage(1)
                  loadRequisitions()
                }}
              >
                🔍
              </Button>
            </div>

            <select
              className="ci-select"
              value={reqStatus}
              onChange={(e) => {
                setReqStatus(e.target.value)
                setReqPage(1)
              }}
              style={{ minWidth: 130, width: 'auto', fontSize: 13, padding: '5px 8px' }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(reqSearch || reqStatus) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReqSearch('')
                    setReqStatus('')
                    setReqPage(1)
                  }}
                >
                  Clear
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={loadRequisitions} disabled={reqs.loading}>
                {reqs.loading ? 'Refreshing...' : '🔄 Refresh'}
              </Button>
            </div>
          </div>

          {reqs.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading material requisitions..." />
            </div>
          ) : reqs.error ? (
            <Alert type="error">{reqs.error}</Alert>
          ) : reqs.results.length === 0 ? (
            <div className="ci-empty" style={{ padding: '40px 20px', textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <h3>No Material Requisitions Recorded</h3>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
                Requisitions represent internal production demand from batch plans against formula specifications.
              </p>
            </div>
          ) : (
            <div className="ci-table-wrap">
              <table className="ci-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Requisition Ref</th>
                    <th style={{ minWidth: 160 }}>Batch / Product</th>
                    <th style={{ minWidth: 110 }}>Target Output</th>
                    <th style={{ minWidth: 80 }}>Round</th>
                    <th style={{ minWidth: 90 }}>Status</th>
                    <th style={{ minWidth: 60 }}>Lines</th>
                    <th style={{ minWidth: 95 }}>Created</th>
                    <th className="ci-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.results.map((r) => {
                    const st = String(r.status || '').toUpperCase()
                    const stStyle = STATUS_COLORS[st] || { bg: '#f1f5f9', color: '#475569' }
                    const productName = r.product_name_snapshot || r.product_code_snapshot || 'Finished Good'
                    const batchNum =
                      r.current_plan_context?.official_batch_number ||
                      r.batch_plan_number ||
                      (r.batch_plan ? `#${r.batch_plan}` : '-')
                    return (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.reference || `REQ-#${r.id}`}</strong>
                        </td>
                        <td>
                          <div><strong>{batchNum}</strong></div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{productName}</div>
                        </td>
                        <td>
                          {r.target_output_quantity_snapshot
                            ? `${r.target_output_quantity_snapshot} ${r.output_uom_code_snapshot || ''}`
                            : '-'}
                        </td>
                        <td>{r.current_round > 0 ? `Round ${r.current_round}` : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}</td>
                        <td>
                          <span
                            className="stock-badge"
                            style={{ background: stStyle.bg, color: stStyle.color, border: 'none' }}
                          >
                            {st}
                          </span>
                        </td>
                        <td>{getRequisitionLines(r).length > 0 ? `${getRequisitionLines(r).length} lines` : '-'}</td>
                        <td>{(r.created_at || '').slice(0, 10)}</td>
                        <td className="ci-actions-col">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenReqDetails(r)}
                            >
                              Details
                            </Button>
                            {st === 'DRAFT' && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleSubmitReq(r)}
                                disabled={actionLoading}
                              >
                                Submit
                              </Button>
                            )}
                            {st === 'SUBMITTED' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleApproveReq(r)}
                                  disabled={actionLoading}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleRejectReq(r)}
                                  disabled={actionLoading}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {st === 'APPROVED' && (
                              <Button
                                size="sm"
                                variant="primary"
                                style={{ background: '#0284c7', borderColor: '#0284c7' }}
                                onClick={() => handleOpenIssue(r)}
                              >
                                📤 Issue Materials
                              </Button>
                            )}
                            {st === 'REJECTED' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleReviseReq(r)}
                                disabled={actionLoading}
                              >
                                🔄 Revise
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!reqs.loading && !reqs.error && reqs.count > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 14,
                padding: '8px 12px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 13,
              }}
            >
              <span style={{ color: '#64748b' }}>
                Showing {(reqPage - 1) * 20 + 1} &ndash; {Math.min(reqPage * 20, reqs.count)} of {reqs.count} requests
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reqPage <= 1 || reqs.loading}
                  onClick={() => setReqPage((p) => Math.max(1, p - 1))}
                >
                  &larr; Previous
                </Button>
                <span style={{ padding: '0 8px', fontWeight: 600 }}>
                  Page {reqPage} of {Math.ceil(reqs.count / 20) || 1}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reqPage * 20 >= reqs.count || reqs.loading}
                  onClick={() => setReqPage((p) => p + 1)}
                >
                  Next &rarr;
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 1: CREATE / EDIT PURCHASE ORDER                         */}
      {/* ============================================================= */}
      {isCreatePoOpen && (
        <PurchaseOrderModal
          isOpen={true}
          mode={editingPo ? 'edit' : 'create'}
          storeId={storeId}
          storeName={storeDisplayName}
          companyId={companyId}
          companies={companies}
          order={editingPo}
          onClose={() => {
            setIsCreatePoOpen(false)
            setEditingPo(null)
          }}
          onSaved={() => {
            loadPurchaseOrders()
            setActionSuccess(editingPo ? 'Purchase order updated.' : 'Draft purchase order created.')
          }}
        />
      )}

      {/* ============================================================= */}
      {/* MODAL 2: PURCHASE ORDER DETAILS & RECEIPT PROGRESS            */}
      {/* ============================================================= */}
      {poDetailOpen && selectedPo && (
        <Modal
          isOpen={true}
          onClose={() => setPoDetailOpen(false)}
          title={`Purchase Order: ${selectedPo.reference || `#${selectedPo.id}`}`}
          maxWidth="880px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
              <div><strong>Status:</strong> {selectedPo.status}</div>
              <div><strong>Supplier:</strong> {selectedPo.supplier_name || selectedPo.supplier_code || `Supplier #${selectedPo.supplier_id}`}</div>
              <div><strong>Receiving Store:</strong> {storeDisplayName}</div>
              <div><strong>Invoiced Entity:</strong> {selectedPo.company_code || 'Accounting Buyer'}</div>
              <div><strong>Currency:</strong> {selectedPo.currency_code || 'INR'}</div>
              <div><strong>Delivery Target:</strong> {selectedPo.expected_delivery_date || '-'}</div>
              <div><strong>Created Date:</strong> {(selectedPo.created_at || '').slice(0, 10)}</div>
              <div><strong>Pre-Tax Subtotal:</strong> {selectedPo.currency_code || '₹'} {selectedPo.subtotal || '-'}</div>
            </div>

            {selectedPo.notes && (
              <div style={{ padding: 10, background: '#f1f5f9', borderRadius: 6, fontSize: 12 }}>
                <strong>Terms &amp; Remarks:</strong> {selectedPo.notes}
              </div>
            )}

            <div>
              <h4 style={{ margin: '10px 0 6px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                Item Lines &amp; Receipt Progress:
              </h4>
              {Array.isArray(selectedPo.delivery_progress) && selectedPo.delivery_progress.length > 0 ? (
                <table className="ci-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ width: 36 }}>#</th>
                      <th>Material</th>
                      <th style={{ textAlign: 'right' }}>Ordered</th>
                      <th style={{ textAlign: 'right' }}>Posted Received</th>
                      <th style={{ textAlign: 'right' }}>Pending Draft</th>
                      <th style={{ textAlign: 'right' }}>Remaining</th>
                      <th style={{ textAlign: 'center' }}>Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.delivery_progress.map((dp) => {
                      const st = dp.delivery_status || 'PENDING'
                      const stStyle = STATUS_COLORS[st] || STATUS_COLORS.PENDING
                      return (
                        <tr key={dp.source_po_line_id || dp.line_number}>
                          <td style={{ color: '#94a3b8' }}>{dp.line_number}</td>
                          <td>
                            <strong>{dp.material_code}</strong>
                            {dp.material_name && <div style={{ fontSize: 11, color: '#64748b' }}>{dp.material_name}</div>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{dp.ordered_quantity} {dp.unit_code}</td>
                          <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{dp.received_quantity} {dp.unit_code}</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>{dp.pending_draft_quantity || '0.000'} {dp.unit_code}</td>
                          <td style={{ textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>{dp.remaining_quantity} {dp.unit_code}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="stock-badge"
                              style={{ background: stStyle.bg, color: stStyle.color, border: 'none' }}
                            >
                              {st}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : Array.isArray(selectedPo.lines) && selectedPo.lines.length > 0 ? (
                <table className="ci-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th>Material</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th style={{ textAlign: 'right' }}>Line Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.material_code || l.material_name || `Item #${l.material_id}`}</td>
                        <td>{l.ordered_quantity || l.quantity} {l.unit_code}</td>
                        <td>{l.unit_price ? `${l.currency_code || '₹'} ${l.unit_price}` : '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {l.line_amount
                            ? `${l.currency_code || '₹'} ${l.line_amount}`
                            : l.quantity && l.unit_price
                            ? `${l.currency_code || '₹'} ${(Number(l.quantity) * Number(l.unit_price)).toFixed(2)}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#64748b', fontSize: 12 }}>No line items recorded.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {selectedPo.status === 'ISSUED' && (
                <Button
                  variant="primary"
                  style={{ background: '#0284c7', borderColor: '#0284c7' }}
                  onClick={() => {
                    setPoDetailOpen(false)
                    handleOpenReceive(selectedPo)
                  }}
                >
                  📥 Receive Against this PO
                </Button>
              )}
              <Button variant="secondary" onClick={() => setPoDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================= */}
      {/* MODAL 3: INWARD STOCK RECEIVING MODAL                         */}
      {/* ============================================================= */}
      {inwardOpen && (
        <InwardStockModal
          storeId={storeId}
          prefillPo={inwardPrefillPo}
          initialDraft={editingDraftReceipt}
          allowDirectMode={false}
          onClose={() => {
            setInwardOpen(false)
            setInwardPrefillPo(null)
            setEditingDraftReceipt(null)
          }}
          onCreated={() => {
            setInwardOpen(false)
            setInwardPrefillPo(null)
            setEditingDraftReceipt(null)
            loadGoodsReceipts()
            loadPurchaseOrders()
            setActionSuccess('Inward goods receipt draft saved.')
          }}
          onPosted={() => {
            setInwardOpen(false)
            setInwardPrefillPo(null)
            setEditingDraftReceipt(null)
            loadGoodsReceipts()
            loadPurchaseOrders()
            setActionSuccess('Goods receipt posted successfully to inventory!')
          }}
        />
      )}

      {/* ============================================================= */}
      {/* MODAL 4: INWARD RECEIPT DETAILS MODAL                         */}
      {/* ============================================================= */}
      {receiptDetailOpen && selectedReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setReceiptDetailOpen(false)}
          title={`Goods Receipt: ${selectedReceipt.reference || `#${selectedReceipt.id}`}`}
          maxWidth="840px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
              <div><strong>Status:</strong> {selectedReceipt.status}</div>
              <div><strong>Source PO:</strong> {selectedReceipt.source_purchase_order_reference || (selectedReceipt.source_purchase_order_id ? `#${selectedReceipt.source_purchase_order_id}` : 'Direct')}</div>
              <div><strong>Receiving Store:</strong> {storeDisplayName}</div>
              <div><strong>Supplier:</strong> {selectedReceipt.supplier_name || '-'}</div>
              <div><strong>Arrived Date:</strong> {selectedReceipt.arrived_at ? selectedReceipt.arrived_at.slice(0, 10) : '-'}</div>
              <div><strong>Invoice Reference:</strong> {selectedReceipt.supplier_invoice_reference || '-'}</div>
              <div><strong>Delivery Note:</strong> {selectedReceipt.delivery_note_reference || '-'}</div>
              <div><strong>Created By:</strong> {selectedReceipt.created_by_username || '-'}</div>
            </div>

            {selectedReceipt.notes && (
              <div style={{ padding: 10, background: '#f1f5f9', borderRadius: 6, fontSize: 12 }}>
                <strong>Receipt Notes:</strong> {selectedReceipt.notes}
              </div>
            )}

            <div>
              <h4 style={{ margin: '10px 0 6px', fontSize: 13 }}>Received Material Lines:</h4>
              {Array.isArray(selectedReceipt.lines) && selectedReceipt.lines.length > 0 ? (
                <table className="ci-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th>#</th>
                      <th>Material</th>
                      <th style={{ textAlign: 'right' }}>Received Qty</th>
                      <th>Lot Reference</th>
                      <th>Container / Package</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReceipt.lines.map((l, idx) => (
                      <tr key={l.id || idx}>
                        <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                        <td>
                          <strong>{l.material_code_snapshot || l.material_code || `Material #${l.material_id}`}</strong>
                          {l.material_name_snapshot && <div style={{ fontSize: 11, color: '#64748b' }}>{l.material_name_snapshot}</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                          {l.received_quantity} {l.unit_code_snapshot || l.unit_code || ''}
                        </td>
                        <td>{l.lot_reference || '-'}</td>
                        <td>{l.container_type_code || l.container_quantity ? `${l.container_quantity || 1} x ${l.container_type_code || 'Package'}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#64748b', fontSize: 12 }}>No lines recorded.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {selectedReceipt.status === 'DRAFT' && (
                <>
                  <Button
                    variant="primary"
                    style={{ background: '#16a34a', borderColor: '#16a34a' }}
                    onClick={() => handlePostReceipt(selectedReceipt)}
                    disabled={actionLoading}
                  >
                    ✅ Post to Inventory
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleCancelReceipt(selectedReceipt)}
                    disabled={actionLoading}
                  >
                    Cancel Draft
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => setReceiptDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================= */}
      {/* MODAL 5: MATERIAL REQUISITION DETAILS MODAL                   */}
      {/* ============================================================= */}
      {reqDetailOpen && selectedReq && (
        <Modal
          isOpen={true}
          onClose={() => setReqDetailOpen(false)}
          title={`Material Request: ${selectedReq.reference || `#${selectedReq.id}`}`}
          maxWidth="840px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
              <div><strong>Status:</strong> {selectedReq.status}</div>
              <div><strong>Batch Plan:</strong> {selectedReq.current_plan_context?.official_batch_number || selectedReq.batch_plan_number || (selectedReq.batch_plan ? `#${selectedReq.batch_plan}` : '-')}</div>
              <div><strong>Product:</strong> {selectedReq.product_name_snapshot || selectedReq.product_code_snapshot || 'Finished Good'}</div>
              <div><strong>Target Output:</strong> {selectedReq.target_output_quantity_snapshot ? `${selectedReq.target_output_quantity_snapshot} ${selectedReq.output_uom_code_snapshot || ''}` : '-'}</div>
              <div><strong>Approval Round:</strong> {selectedReq.current_round > 0 ? `Round ${selectedReq.current_round}` : 'Not submitted yet'}</div>
              <div><strong>Created Date:</strong> {(selectedReq.created_at || '').slice(0, 10)}</div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Formula Demand Lines &amp; Store Availability:
                </h4>
                {reqBalancesLoading && (
                  <span style={{ fontSize: 12, color: '#0284c7' }}>
                    ⏳ Checking store stock availability...
                  </span>
                )}
              </div>

              {/* Stock availability summary banner */}
              {(() => {
                const reqLines = getRequisitionLines(selectedReq)
                if (!reqBalancesLoading && reqLines.length > 0 && Object.keys(reqBalances).length > 0) {
                  let hasShortage = false
                  let hasOutOfStock = false
                  for (const line of reqLines) {
                    const lineKey = line.id || line.line_number
                    const rows = reqBalances[lineKey] || []
                    const avail = rows.reduce((acc, row) => acc + (Number(row.net_quantity) || 0), 0)
                    const reqQty = Number(line.requested_quantity || line.calculated_quantity || line.base_line_quantity_snapshot || 0)
                    if (avail <= 0) hasOutOfStock = true
                    else if (avail < reqQty) hasShortage = true
                  }
                  if (hasOutOfStock || hasShortage) {
                    return (
                      <div style={{
                        padding: '10px 14px',
                        marginBottom: 12,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        fontSize: 12.5,
                        color: '#991b1b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <div>
                          <strong>Stock Shortage Detected:</strong> One or more requested materials do not have sufficient recorded inventory in {storeDisplayName}. Review lines below before issuing.
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{
                      padding: '10px 14px',
                      marginBottom: 12,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>✅</span>
                      <div>
                        <strong>All Materials In Stock:</strong> Warehouse has sufficient recorded balance to fulfill all requested formula lines.
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              {(() => {
                const reqLines = getRequisitionLines(selectedReq)
                if (reqLines.length === 0) {
                  return <div style={{ color: '#64748b', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>No lines recorded.</div>
                }

                return (
                  <table className="ci-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ width: 32 }}>#</th>
                        <th>Material</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Requested Quantity</th>
                        <th style={{ textAlign: 'right' }}>Available in Store</th>
                        <th style={{ textAlign: 'center' }}>Stock Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reqLines.map((l, idx) => {
                        const lineKey = l.id || l.line_number
                        const rows = reqBalances[lineKey] || []
                        const avail = rows.reduce((acc, row) => acc + (Number(row.net_quantity) || 0), 0)
                        const reqQty = Number(l.requested_quantity || l.calculated_quantity || l.base_line_quantity_snapshot || 0)
                        const unit = l.unit_code_snapshot || l.unit_code || ''
                        const isShort = avail < reqQty && avail > 0
                        const isOut = avail <= 0
                        const isOk = avail >= reqQty

                        return (
                          <tr key={l.id || idx}>
                            <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                            <td>
                              <strong>{l.material_code_snapshot || l.material_code || `Material #${l.material_id}`}</strong>
                              {l.material_name_snapshot && <div style={{ fontSize: 11, color: '#64748b' }}>{l.material_name_snapshot}</div>}
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: l.material_kind_snapshot === 'PACKAGING_MATERIAL' ? '#f3e8ff' : '#e0f2fe',
                                color: l.material_kind_snapshot === 'PACKAGING_MATERIAL' ? '#6b21a8' : '#0369a1',
                              }}>
                                {l.material_kind_snapshot === 'PACKAGING_MATERIAL' ? 'Packaging' : 'Raw Material'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {l.requested_quantity || l.calculated_quantity || l.base_line_quantity_snapshot || '-'} {unit}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              {reqBalancesLoading ? (
                                <span style={{ color: '#94a3b8' }}>...</span>
                              ) : (
                                <span style={{ color: isOut ? '#dc2626' : isShort ? '#d97706' : '#16a34a' }}>
                                  {avail.toFixed(3)} {unit}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {reqBalancesLoading ? (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Checking…</span>
                              ) : isOk ? (
                                <span className="stock-badge" style={{ background: '#dcfce7', color: '#15803d', border: 'none', fontWeight: 600 }}>
                                  ✅ Sufficient Stock
                                </span>
                              ) : isShort ? (
                                <span className="stock-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none', fontWeight: 600 }}>
                                  ⚠️ Short by {(reqQty - avail).toFixed(3)} {unit}
                                </span>
                              ) : (
                                <span className="stock-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', fontWeight: 600 }}>
                                  ❌ Out of Stock
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {selectedReq.status === 'APPROVED' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setReqDetailOpen(false)
                                    handleOpenIssue(selectedReq, l)
                                  }}
                                >
                                  Issue Line
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {selectedReq.status === 'APPROVED' && (
                <Button
                  variant="primary"
                  style={{ background: '#0284c7', borderColor: '#0284c7' }}
                  onClick={() => {
                    setReqDetailOpen(false)
                    handleOpenIssue(selectedReq)
                  }}
                >
                  📤 Open Outward Issue Slip
                </Button>
              )}
              <Button variant="secondary" onClick={() => setReqDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================= */}
      {/* MODAL 6: OUTWARD ISSUE MODAL (From Approved Material Request) */}
      {/* ============================================================= */}
      {issueModalOpen && (
        <IssueOutwardModal
          storeId={storeId}
          materialId={issuePrefill?.materialId}
          materialCode={issuePrefill?.materialCode}
          materialName={issuePrefill?.materialName}
          initialBatchReference={issuePrefill?.initialBatchReference}
          initialProductReference={issuePrefill?.initialProductReference}
          initialQuantity={issuePrefill?.initialQuantity}
          initialCompanyId={issuePrefill?.initialCompanyId}
          onClose={() => {
            setIssueModalOpen(false)
            setIssuePrefill(null)
          }}
          onIssued={() => {
            setIssueModalOpen(false)
            setIssuePrefill(null)
            loadRequisitions()
            setActionSuccess('Material issued successfully from warehouse.')
          }}
        />
      )}

      {/* Themed confirm/prompt dialogs — replaces browser native dialogs */}
      {ConfirmNode}
    </div>
  )
}
