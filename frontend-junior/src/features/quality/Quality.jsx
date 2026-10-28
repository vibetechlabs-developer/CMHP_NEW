import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { operationsService } from '../operations/operationsService'
import { qualityService } from './qualityService'
import useAuth from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import { getCurrentWorkspaceObject } from '../../utils/workspace'
import {
  selectFormulaApprovals,
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../utils/companySelectors'
import { decideFormulaApproval } from '../../store/erpSlice'
import BmrRequisitionDocument from '../../components/BmrRequisitionDocument'
import {
  exportFormulaPrint,
  exportFormulaExcel,
  exportFormulaCsv,
} from '../../utils/formulaExport'
import useSelectedCompany from '../../hooks/useSelectedCompany'
import { approveRevision, rejectRevision, listFormulas, getRevision } from '../formulas/formulasService'
import './Quality.css'
import '../inventory/tabs/CommonInventory.css'

const TABS = [
  { key: 'order_qc', label: 'Order QC Inspections' },
  { key: 'order_qa', label: 'Order QA Releases' },
  { key: 'qc', label: 'Batch QC Review' },
  { key: 'qa', label: 'Batch QA Release' },
  { key: 'trace', label: 'Batch Traceability' },
  { key: 'formula_approvals', label: 'Formula Approvals' },
]

const FORMULA_STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'DECLINED']

const DECLINE_CATEGORIES = [
  'Stoichiometric Discrepancy',
  'Ingredient Out of Spec',
  'Excipient Ratio Mismatch',
  'Regulatory Non-Compliance',
  'Dosage / Potency Issue',
  'Missing Certificate of Analysis (COA)',
  'Other Analytical Variance',
]

const QC_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const QA_FILTERS = ['ALL', 'PENDING', 'RELEASED', 'REJECTED']

const ORDER_QC_FILTERS = ['ALL', 'PENDING', 'PASSED', 'PARTIAL', 'FAILED']
const ORDER_QA_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

const listData = (response) =>
  Array.isArray(response.data) ? response.data : response.data?.results || []

function qcTone(status) {
  if (status === 'APPROVED' || status === 'PASSED') return 'success'
  if (status === 'REJECTED' || status === 'FAILED') return 'danger'
  if (status === 'PARTIAL') return 'warning'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

function qaTone(status) {
  if (status === 'RELEASED' || status === 'APPROVED') return 'success'
  if (status === 'REJECTED' || status === 'HOLD') return 'danger'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

export default function Quality() {
  const { user } = useAuth()
  const [tab, setTab] = useState('order_qc')
  const [batches, setBatches] = useState([])
  const [orderQcRecords, setOrderQcRecords] = useState([])
  const [orderQaRecords, setOrderQaRecords] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Search states for tabs
  const [orderQcSearch, setOrderQcSearch] = useState('')
  const [orderQaSearch, setOrderQaSearch] = useState('')
  const [qcSearch, setQcSearch] = useState('')
  const [qaSearch, setQaSearch] = useState('')

  // Batch filters
  const [qcFilter, setQcFilter] = useState('PENDING')
  const [qaFilter, setQaFilter] = useState('PENDING')

  // Order filters
  const [orderQcFilter, setOrderQcFilter] = useState('ALL')
  const [orderQaFilter, setOrderQaFilter] = useState('ALL')

  // Batch QC / QA decision modal
  const [decisionModal, setDecisionModal] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)

  // Order QC inspection modal
  const [orderQcModal, setOrderQcModal] = useState(null)
  const [qcParams, setQcParams] = useState({
    appearance: 'PASS',
    packaging: 'PASS',
    labeling: 'PASS',
    specs: 'PASS',
  })
  const [qcInspectedQty, setQcInspectedQty] = useState(0)
  const [qcAcceptedQty, setQcAcceptedQty] = useState(0)
  const [qcRejectedQty, setQcRejectedQty] = useState(0)
  const [qcRemarks, setQcRemarks] = useState('')

  // Order QA release modal
  const [orderQaModal, setOrderQaModal] = useState(null)
  const [qaParams, setQaParams] = useState({
    bmr_review: 'PASS',
    coa_verification: 'PASS',
    compliance_signoff: 'PASS',
  })
  const [qaApprovedQty, setQaApprovedQty] = useState(0)
  const [qaRemarks, setQaRemarks] = useState('')

  // Formula Approval States (QC Lifecycle)
  const dispatch = useDispatch()
  const { companies, companyId, setCompanyId } = useSelectedCompany()
  const activeCompanyId = useSelector(selectActiveCompanyId)
  const activeCompanyKey = useSelector(selectActiveCompanyKey)
  const effectiveCompanyId = companyId || activeCompanyId || 2
  const [apiFormulaApprovals, setApiFormulaApprovals] = useState([])
  const [loadingFormulaApprovals, setLoadingFormulaApprovals] = useState(false)

  const [formulaSearch, setFormulaSearch] = useState('')
  const [formulaStatusFilter, setFormulaStatusFilter] = useState('ALL')
  const [reviewFormulaModal, setReviewFormulaModal] = useState(null)
  const [approveDialogModal, setApproveDialogModal] = useState(null)
  const [qcApprovalRemarks, setQcApprovalRemarks] = useState('')
  const [declineDialogModal, setDeclineDialogModal] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineCategory, setDeclineCategory] = useState('Stoichiometric Discrepancy')
  const [declineValidationError, setDeclineValidationError] = useState('')

  // Traceability
  const [traceBatchId, setTraceBatchId] = useState('')
  const [trace, setTrace] = useState(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [batchRes, qcRes, qaRes] = await Promise.all([
        operationsService.getBatches(),
        qualityService.getQcRecords(),
        qualityService.getQaRecords(),
      ])
      setBatches(listData(batchRes))
      setOrderQcRecords(listData(qcRes))
      setOrderQaRecords(listData(qaRes))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Filtered rows with search
  const qcRows = useMemo(
    () =>
      batches.filter((batch) => {
        if (qcFilter !== 'ALL' && batch.qc_status !== qcFilter) return false
        if (qcSearch.trim()) {
          const q = qcSearch.toLowerCase().trim()
          return (
            String(batch.number || '').toLowerCase().includes(q) ||
            String(batch.product_name || '').toLowerCase().includes(q) ||
            String(batch.company_name || '').toLowerCase().includes(q)
          )
        }
        return true
      }),
    [batches, qcFilter, qcSearch]
  )

  const qaRows = useMemo(
    () =>
      batches.filter((batch) => {
        if (qaFilter !== 'ALL' && batch.qa_status !== qaFilter) return false
        if (qaSearch.trim()) {
          const q = qaSearch.toLowerCase().trim()
          return (
            String(batch.number || '').toLowerCase().includes(q) ||
            String(batch.product_name || '').toLowerCase().includes(q) ||
            String(batch.company_name || '').toLowerCase().includes(q)
          )
        }
        return true
      }),
    [batches, qaFilter, qaSearch]
  )

  const orderQcRows = useMemo(
    () =>
      orderQcRecords.filter((rec) => {
        if (orderQcFilter !== 'ALL' && rec.status !== orderQcFilter) return false
        if (orderQcSearch.trim()) {
          const q = orderQcSearch.toLowerCase().trim()
          return (
            String(rec.number || '').toLowerCase().includes(q) ||
            String(rec.order_number || '').toLowerCase().includes(q) ||
            String(rec.customer_name || '').toLowerCase().includes(q) ||
            String(rec.product_name || '').toLowerCase().includes(q)
          )
        }
        return true
      }),
    [orderQcRecords, orderQcFilter, orderQcSearch]
  )

  const orderQaRows = useMemo(
    () =>
      orderQaRecords.filter((rec) => {
        if (orderQaFilter !== 'ALL' && rec.status !== orderQaFilter) return false
        if (orderQaSearch.trim()) {
          const q = orderQaSearch.toLowerCase().trim()
          return (
            String(rec.number || '').toLowerCase().includes(q) ||
            String(rec.order_number || '').toLowerCase().includes(q) ||
            String(rec.customer_name || '').toLowerCase().includes(q) ||
            String(rec.product_name || '').toLowerCase().includes(q)
          )
        }
        return true
      }),
    [orderQaRecords, orderQaFilter, orderQaSearch]
  )

  // Formula Approval API Loading & Synchronization
  const loadApiFormulaApprovals = useCallback(async () => {
    const compId = effectiveCompanyId
    try {
      setLoadingFormulaApprovals(true)
      const data = await listFormulas(compId, { pageSize: 100 })
      const formulasList = Array.isArray(data) ? data : data?.results || []

      const mapped = []
      for (const formula of formulasList) {
        const revisions = formula.revisions || []
        const sortedRevisions = [...revisions].sort((a, b) => b.revision_number - a.revision_number)

        // Find submitted revision (if any)
        const submittedRev = sortedRevisions.find((r) => r.status === 'SUBMITTED')
        // Find latest approved revision (if any)
        const approvedRev = sortedRevisions.find((r) => r.status === 'APPROVED')
        // Find latest rejected/declined revision (if any)
        const declinedRev = sortedRevisions.find(
          (r) => r.status === 'REJECTED' || (r.status === 'DRAFT' && Boolean(r.last_rejection_reason))
        )

        const targetRevisions = []
        if (submittedRev) {
          targetRevisions.push(submittedRev)
        }
        if (approvedRev && (!submittedRev || approvedRev.id !== submittedRev.id)) {
          targetRevisions.push(approvedRev)
        }
        if (declinedRev && !submittedRev && !approvedRev) {
          targetRevisions.push(declinedRev)
        }

        for (const rev of targetRevisions) {
          const isSubmitted = rev.status === 'SUBMITTED'
          const isApproved = rev.status === 'APPROVED'
          const isDeclined = rev.status === 'REJECTED' || Boolean(rev.last_rejection_reason && rev.status === 'DRAFT')

          const status = isSubmitted ? 'PENDING' : isApproved ? 'APPROVED' : 'DECLINED'

          mapped.push({
            id: `FA-2026-${String(rev.id).padStart(3, '0')}`,
            realRevision: true,
            company: compId,
            formulaId: formula.id,
            revisionId: rev.id,
            revisionNumber: rev.revision_number,
            revisionVersion: rev.version,
            productName: formula.product_name || formula.name,
            productCode: formula.product_code || formula.code,
            productBmrNo: formula.product_bmr_no || null,
            formulaCode: formula.code || null,
            dosageForm: formula.product_type || (rev.output_uom_code === 'BTL' ? 'Drops' : 'Oral Liquid'),
            formulaName: formula.name,
            revisionName: `Rev 0${rev.revision_number} - Production Master`,
            formulaBaseQuantity: rev.base_output_quantity || '1',
            formulaBaseUnit: rev.output_uom_code || 'L',
            batchQuantity: rev.base_output_quantity || '1',
            batchUnit: rev.output_uom_code || 'L',
            scaleFactor: 1,
            ingredientsCount: rev.line_count ?? (rev.lines?.length || 0),
            submittedBy: rev.submitted_by_name || 'Production Department',
            submittedAt: rev.submitted_at || rev.updated_at || rev.created_at,
            status,
            decidedBy: rev.approved_by_name || rev.last_rejected_by_name || (isApproved ? 'Dr. R. K. Mehta (QA Head)' : isDeclined ? 'QC In-Charge' : null),
            decidedAt: rev.approved_at || rev.last_rejected_at,
            decisionRemarks: rev.approval_remarks || (isApproved ? 'Approved in Master Formula Revision' : ''),
            declineReason: rev.last_rejection_reason || '',
            declineCategory: 'Stoichiometric Discrepancy',
            materials: (rev.lines || []).map((line, idx) => ({
              id: line.id,
              rmCode: line.material_code || `RM-${String(idx + 1).padStart(3, '0')}`,
              name: line.material_name,
              category: line.material_type === 'RAW_MATERIAL' ? 'Active API' : 'Packaging / Vehicle',
              isExcipient: line.material_type !== 'RAW_MATERIAL',
              baseQuantity: Number(line.quantity),
              baseUnit: line.unit_code,
              requiredQuantity: Number(line.quantity),
              unit: line.unit_code,
              scaledUnit: line.unit_code,
              labelClaim: line.label_claim || (line.potency ? `Potency: ${line.potency}` : ''),
              arNo: line.ar_no || '—',
              notes: line.notes || '',
            })),
          })
        }
      }
      setApiFormulaApprovals(mapped)
    } catch (err) {
      console.warn('Could not load formulas from API:', err)
    } finally {
      setLoadingFormulaApprovals(false)
    }
  }, [effectiveCompanyId])

  useEffect(() => {
    loadApiFormulaApprovals()
  }, [loadApiFormulaApprovals])

  // REAL LIVE DATA ONLY - exclusively display actual products from API
  const allFormulaApprovals = useMemo(() => {
    return apiFormulaApprovals
  }, [apiFormulaApprovals])

  // Formula Approval Metrics & Filtered Data
  const totalFormulaRequests = allFormulaApprovals.length
  const pendingFormulaApprovals = useMemo(
    () => allFormulaApprovals.filter((a) => a.status === 'PENDING').length,
    [allFormulaApprovals]
  )
  const approvedFormulaApprovals = useMemo(
    () => allFormulaApprovals.filter((a) => a.status === 'APPROVED').length,
    [allFormulaApprovals]
  )
  const declinedFormulaApprovals = useMemo(
    () => allFormulaApprovals.filter((a) => a.status === 'DECLINED').length,
    [allFormulaApprovals]
  )

  const filteredFormulaRequests = useMemo(() => {
    return allFormulaApprovals
      .filter((req) => {
        if (formulaStatusFilter !== 'ALL' && req.status !== formulaStatusFilter) {
          return false
        }
        if (formulaSearch.trim()) {
          const q = formulaSearch.toLowerCase().trim()
          return (
            String(req.id || '').toLowerCase().includes(q) ||
            String(req.productName || '').toLowerCase().includes(q) ||
            String(req.productCode || '').toLowerCase().includes(q) ||
            String(req.formulaName || '').toLowerCase().includes(q) ||
            String(req.submittedBy || '').toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1
        return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
      })
  }, [allFormulaApprovals, formulaStatusFilter, formulaSearch])

  const [reviewModalLoading, setReviewModalLoading] = useState(false)

  const handleOpenReviewModal = async (req) => {
    // Always fetch the full revision from the API to guarantee ALL lines are loaded.
    // The list API uses FormulaRevisionSummarySerializer which has no `lines` field.
    if (req.realRevision && req.formulaId && req.revisionId) {
      setReviewModalLoading(true)
      setReviewFormulaModal({ ...req, materials: [] }) // open immediately with spinner
      try {
        const fullRev = await getRevision(req.company || activeCompanyId || 2, req.formulaId, req.revisionId)
        const mappedMaterials = (fullRev?.lines || []).map((line, idx) => ({
          id: line.id,
          rmCode: line.material_code || `RM-${String(idx + 1).padStart(3, '0')}`,
          name: line.material_name,
          category: line.material_type === 'RAW_MATERIAL' ? 'Active API' : 'Packaging / Vehicle',
          isExcipient: line.material_type !== 'RAW_MATERIAL',
          baseQuantity: Number(line.quantity),
          baseUnit: line.unit_code,
          requiredQuantity: Number(line.quantity),
          unit: line.unit_code,
          scaledUnit: line.unit_code,
          labelClaim: line.label_claim || (line.potency ? `Potency: ${line.potency}` : ''),
          arNo: line.ar_no || '—',
          notes: line.notes || '',
        }))
        setReviewFormulaModal((prev) => ({
          ...prev,
          materials: mappedMaterials,
          ingredientsCount: mappedMaterials.length,
          revisionVersion: fullRev?.version ?? prev?.revisionVersion,
        }))
      } catch (err) {
        console.warn('Failed to load revision lines:', err)
      } finally {
        setReviewModalLoading(false)
      }
      return
    }
    setReviewFormulaModal(req)
  }

  const [approving, setApproving] = useState(false)
  const [approveDialogError, setApproveDialogError] = useState('')

  const handleOpenApproveModal = (req) => {
    setQcApprovalRemarks('')
    setApproveDialogError('')
    setApproveDialogModal(req)
  }

  const handleConfirmApprove = async () => {
    if (!approveDialogModal) return
    const approverName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Dr. R. K. Mehta'
    const remarks = qcApprovalRemarks.trim() || 'Calculations verified against pharmacopeia stoichiometric specifications. Formulation approved for BMR issuance.'

    setApproving(true)
    setApproveDialogError('')

    try {
      if (approveDialogModal.formulaId && approveDialogModal.revisionId) {
        // Fetch latest version right before approval to avoid 409 concurrency conflicts
        let currentVersion = approveDialogModal.revisionVersion
        try {
          const freshRev = await getRevision(
            approveDialogModal.company || activeCompanyId || 2,
            approveDialogModal.formulaId,
            approveDialogModal.revisionId
          )
          if (freshRev?.version) {
            currentVersion = freshRev.version
          }
        } catch (_) {}

        await approveRevision(
          approveDialogModal.company || activeCompanyId || 2,
          approveDialogModal.formulaId,
          approveDialogModal.revisionId,
          currentVersion || 1,
          remarks
        )
      }

      dispatch(
        decideFormulaApproval({
          id: approveDialogModal.id,
          decision: 'APPROVED',
          remarks: remarks,
          decidedBy: approverName,
          decidedByRole: 'QA Manager',
        })
      )

      setSuccess(`Formula calculation for ${approveDialogModal.productName} (${approveDialogModal.id}) successfully approved!`)
      setApproveDialogModal(null)
      if (reviewFormulaModal?.id === approveDialogModal.id) {
        setReviewFormulaModal((prev) => ({
          ...prev,
          status: 'APPROVED',
          decidedBy: approverName,
          decidedAt: new Date().toISOString(),
          decisionRemarks: remarks,
        }))
      }
      loadApiFormulaApprovals()
    } catch (err) {
      const msg = getErrorMessage(err)
      setApproveDialogError(msg)
      setError(msg)
    } finally {
      setApproving(false)
    }
  }

  const handleOpenDeclineModal = (req) => {
    setDeclineReason('')
    setDeclineCategory('Stoichiometric Discrepancy')
    setDeclineValidationError('')
    setDeclineDialogModal(req)
  }

  const handleConfirmDecline = async () => {
    if (!declineDialogModal) return
    if (!declineReason.trim() || declineReason.trim().length < 5) {
      setDeclineValidationError('A specific analytical decline reason is mandatory (minimum 5 characters).')
      return
    }

    const declinerName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Pooja Varma'
    const fullReason = declineCategory ? `[${declineCategory}] ${declineReason.trim()}` : declineReason.trim()

    try {
      if (declineDialogModal.formulaId && declineDialogModal.revisionId) {
        await rejectRevision(
          declineDialogModal.company || activeCompanyId || 2,
          declineDialogModal.formulaId,
          declineDialogModal.revisionId,
          declineDialogModal.revisionVersion || 1,
          fullReason
        )
      }

      dispatch(
        decideFormulaApproval({
          id: declineDialogModal.id,
          decision: 'DECLINED',
          reason: declineReason.trim(),
          declineCategory: declineCategory,
          decidedBy: declinerName,
          decidedByRole: 'QC In-Charge',
        })
      )

      setSuccess(`Formula calculation for ${declineDialogModal.productName} declined. Reason logged and returned to production for revision.`)
      setDeclineDialogModal(null)
      if (reviewFormulaModal?.id === declineDialogModal.id) {
        setReviewFormulaModal((prev) => ({
          ...prev,
          status: 'DECLINED',
          decidedBy: declinerName,
          decidedAt: new Date().toISOString(),
          declineReason: declineReason.trim(),
          declineCategory: declineCategory,
        }))
      }
      loadApiFormulaApprovals()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // Batch QC/QA decision handlers
  const openDecision = (type, batch) => {
    setError('')
    setSuccess('')
    setRemarks('')
    setDecisionModal({ type, batch })
  }

  const closeDecision = () => {
    if (!saving) setDecisionModal(null)
  }

  const submitDecision = async (decision) => {
    if (!decisionModal) return
    setSaving(true)
    setError('')

    try {
      const { type, batch } = decisionModal

      if (type === 'qc') {
        await qualityService.qcDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QC ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`
        )
      } else {
        await qualityService.qaDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QA ${decision === 'RELEASE' ? 'released' : 'put on hold'}.`
        )
      }

      setDecisionModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Order QC Inspection Modal Handlers
  const openOrderQc = (qc) => {
    setError('')
    setSuccess('')
    setOrderQcModal(qc)
    setQcInspectedQty(qc.ordered_qty || 0)
    setQcAcceptedQty(qc.ordered_qty || 0)
    setQcRejectedQty(0)
    setQcRemarks(qc.remarks || '')
    setQcParams(
      qc.parameters || {
        appearance: 'PASS',
        packaging: 'PASS',
        labeling: 'PASS',
        specs: 'PASS',
      }
    )
  }

  const submitOrderQc = async (outcome) => {
    if (!orderQcModal) return
    setSaving(true)
    setError('')

    try {
      await qualityService.submitQcInspection(orderQcModal.id, {
        outcome,
        inspectedQty: qcInspectedQty,
        acceptedQty: qcAcceptedQty,
        rejectedQty: qcRejectedQty,
        remarks: qcRemarks,
        parameters: qcParams,
        user,
      })

      setSuccess(
        `Order QC #${orderQcModal.number} marked as ${outcome}. ${
          outcome === 'PASS' || outcome === 'PARTIAL'
            ? 'Order has progressed to QA Release queue.'
            : 'Order returned as QC Failed.'
        }`
      )
      setOrderQcModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Order QA Release Modal Handlers
  const openOrderQa = (qa) => {
    setError('')
    setSuccess('')
    setOrderQaModal(qa)
    setQaApprovedQty(qa.qc_accepted_qty || qa.ordered_qty || 0)
    setQaRemarks(qa.remarks || '')
    setQaParams(
      qa.parameters || {
        bmr_review: 'PASS',
        coa_verification: 'PASS',
        compliance_signoff: 'PASS',
      }
    )
  }

  const submitOrderQa = async (decision) => {
    if (!orderQaModal) return
    setSaving(true)
    setError('')

    try {
      await qualityService.submitQaRelease(orderQaModal.id, {
        decision,
        approvedQty: qaApprovedQty,
        remarks: qaRemarks,
        parameters: qaParams,
        user,
      })

      setSuccess(
        `Order QA #${orderQaModal.number} ${decision === 'APPROVE' ? 'approved' : 'rejected'}. ${
          decision === 'APPROVE'
            ? `Billable quantity ${qaApprovedQty} is now ready to invoice in the Invoicing module.`
            : 'Order marked as QA Rejected.'
        }`
      )
      setOrderQaModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Traceability
  const loadTrace = async (batchId) => {
    setTraceBatchId(batchId)
    setTrace(null)
    setTraceError('')

    if (!batchId) return

    setTraceLoading(true)
    try {
      const response = await qualityService.getBatchTraceability(batchId)
      setTrace(response.data)
    } catch (err) {
      setTraceError(getErrorMessage(err))
    } finally {
      setTraceLoading(false)
    }
  }

  const selectedTraceBatch = batches.find(
    (batch) => String(batch.id) === String(traceBatchId)
  )

  const currentWorkspace = getCurrentWorkspaceObject(user)
  const companyName = currentWorkspace?.shortName || currentWorkspace?.name || 'Company Workspace'

  const totalInspections = orderQcRecords.length + batches.length
  const pendingCount = orderQcRecords.filter((r) => r.status === 'PENDING').length + batches.filter((b) => b.qc_status === 'PENDING').length
  const passedCount = orderQcRecords.filter((r) => r.status === 'PASSED' || r.status === 'APPROVED').length + batches.filter((b) => b.qc_status === 'APPROVED').length
  const rejectedCount = orderQcRecords.filter((r) => r.status === 'FAILED' || r.status === 'REJECTED' || (Number(r.rejected_quantity) > 0)).length + batches.filter((b) => b.qc_status === 'REJECTED').length
  const qaReleasedCount = orderQaRecords.filter((r) => r.status === 'RELEASED' || r.status === 'APPROVED').length

  return (
    <div className="inv">
      <HeroBanner
        eyebrow="GMP Compliance &amp; Laboratory"
        title="Quality Control &amp; QA Release"
        subtitle="Verify Order inspection parameters (QC), grant QA release sign-off for billable invoicing, review production batches, and trace manufacturing history end-to-end."
      />

      <PageHeader
        breadcrumbs={['Workspace', companyName, 'Quality Control']}
        title="Quality Control & QA Release"
        subtitle="Verify Order inspection parameters (QC), grant QA release sign-off for billable invoicing, review production batches, and trace manufacturing history end-to-end."
        pill="GMP Compliance Lab"
        primaryAction={{
          label: '+ Record Inspection',
          onClick: () => {
            if (orderQcRows.length > 0) openOrderQc(orderQcRows[0])
            else if (qcRows.length > 0) openDecision('qc', qcRows[0])
          },
        }}
      />

      {/* Summary KPI Cards */}
      <div className="ci-summary-grid" style={{ marginBottom: 18 }}>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>🔬</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Total Inspections</span>
            <span className="ci-card-value">{totalInspections}</span>
            <span className="ci-card-subtext">Order &amp; Batch QA/QC runs</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>⏳</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Pending Review</span>
            <span className="ci-card-value" style={{ color: '#ca8a04' }}>{pendingCount}</span>
            <span className="ci-card-subtext">Awaiting clearance</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>✓</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Passed &amp; Approved</span>
            <span className="ci-card-value" style={{ color: '#16a34a' }}>{passedCount}</span>
            <span className="ci-card-subtext">Specs fully compliant</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>✕</div>
          <div className="ci-card-info">
            <span className="ci-card-label">Rejections / Discrepancies</span>
            <span className="ci-card-value" style={{ color: '#dc2626' }}>{rejectedCount}</span>
            <span className="ci-card-subtext">Defect or out-of-spec</span>
          </div>
        </div>
        <div className="ci-card">
          <div className="ci-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>📋</div>
          <div className="ci-card-info">
            <span className="ci-card-label">QA Released</span>
            <span className="ci-card-value" style={{ color: '#7c3aed' }}>{qaReleasedCount}</span>
            <span className="ci-card-subtext">Sign-off for billing</span>
          </div>
        </div>
      </div>

      <div className="inv-tabs">
        {TABS.map((item) => {
          const isApprovals = item.key === 'formula_approvals'
          const count = isApprovals ? pendingFormulaApprovals : 0
          return (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'inv-tab active' : 'inv-tab'}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              {count > 0 && <span className="tab-pending-badge">{count}</span>}
            </button>
          )
        })}
      </div>

      {error && !decisionModal && !orderQcModal && !orderQaModal && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* ========================================================
          ORDER QC INSPECTIONS
          ======================================================== */}
      {tab === 'order_qc' && (
        <div className="inv-panel">
          <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Order Quality Inspections (QC)</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Inspection parameters, accepted/rejected quantities, and outcome clearance before QA release.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search inspections…"
                value={orderQcSearch}
                onChange={(e) => setOrderQcSearch(e.target.value)}
                className="company-input"
                style={{ width: 190 }}
              />
              <div className="qc-filter-group">
                {ORDER_QC_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={orderQcFilter === f ? 'qc-filter active' : 'qc-filter'}
                    onClick={() => setOrderQcFilter(f)}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>QC Number</th>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Company</th>
                  <th>Ordered Qty</th>
                  <th>Inspected</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Status</th>
                  <th>Inspector</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orderQcRows.map((qc) => (
                  <tr key={qc.id}>
                    <td className="cell-strong">{qc.number}</td>
                    <td><strong>{qc.order_number}</strong></td>
                    <td>{qc.customer_name}</td>
                    <td>{qc.company_name}</td>
                    <td>{qc.ordered_qty}</td>
                    <td>{qc.inspected_qty}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{qc.accepted_qty}</td>
                    <td style={{ color: qc.rejected_qty > 0 ? '#dc2626' : undefined }}>{qc.rejected_qty}</td>
                    <td>
                      <StatusPill tone={qcTone(qc.status)}>
                        {qc.status}
                      </StatusPill>
                    </td>
                    <td>{qc.inspector || '—'}</td>
                    <td>{qc.inspection_date || '—'}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openOrderQc(qc)}
                      >
                        {qc.status === 'PENDING' ? 'Inspect' : 'Review'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && orderQcRows.length === 0 && (
              <p className="inv-empty">No Order QC inspection records found. Confirm an order in the Orders module to generate a QC inspection.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          ORDER QA RELEASES
          ======================================================== */}
      {tab === 'order_qa' && (
        <div className="inv-panel">
          <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Order QA Release (Final Sign-off)</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                QA release sign-off is required before invoicing. QA-approved quantity becomes the billable quantity.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search QA releases…"
                value={orderQaSearch}
                onChange={(e) => setOrderQaSearch(e.target.value)}
                className="company-input"
                style={{ width: 190 }}
              />
              <div className="qc-filter-group">
                {ORDER_QA_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={orderQaFilter === f ? 'qc-filter active' : 'qc-filter'}
                    onClick={() => setOrderQaFilter(f)}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>QA Number</th>
                  <th>Order Number</th>
                  <th>QC Ref</th>
                  <th>Customer</th>
                  <th>Company</th>
                  <th>QC Accepted Qty</th>
                  <th>QA Billable Qty</th>
                  <th>Status</th>
                  <th>QA Officer</th>
                  <th>Released At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orderQaRows.map((qa) => (
                  <tr key={qa.id}>
                    <td className="cell-strong">{qa.number}</td>
                    <td><strong>{qa.order_number}</strong></td>
                    <td>{qa.qc_number}</td>
                    <td>{qa.customer_name}</td>
                    <td>{qa.company_name}</td>
                    <td>{qa.qc_accepted_qty}</td>
                    <td style={{ color: '#0284c7', fontWeight: 700 }}>{qa.qa_approved_qty}</td>
                    <td>
                      <StatusPill tone={qaTone(qa.status)}>
                        {qa.status}
                      </StatusPill>
                    </td>
                    <td>{qa.release_officer || '—'}</td>
                    <td>{qa.released_at ? new Date(qa.released_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <Button
                        variant={qa.status === 'PENDING' ? 'primary' : 'secondary'}
                        onClick={() => openOrderQa(qa)}
                      >
                        {qa.status === 'PENDING' ? 'Take Approval' : 'Details'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && orderQaRows.length === 0 && (
              <p className="inv-empty">No Order QA release records found. Orders will appear here once their QC inspection passes.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH QC REVIEW
          ======================================================== */}
      {tab === 'qc' && (
        <div className="inv-panel">
          <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Batches Awaiting Quality Control</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Batch analytical assay results and compliance sign-off.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search batches…"
                value={qcSearch}
                onChange={(e) => setQcSearch(e.target.value)}
                className="company-input"
                style={{ width: 190 }}
              />
              <div className="qc-filter-group">
                {QC_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={qcFilter === f ? 'qc-filter active' : 'qc-filter'}
                    onClick={() => setQcFilter(f)}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>Formula</th>
                  <th>Planned</th>
                  <th>Produced</th>
                  <th>QC Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qcRows.map((batch) => (
                  <tr key={batch.id}>
                    <td className="cell-strong">{batch.number}</td>
                    <td>{batch.company_name}</td>
                    <td>{batch.product_name}</td>
                    <td>{batch.formula_name}</td>
                    <td>{batch.planned_quantity}</td>
                    <td>{batch.produced_quantity}</td>
                    <td>
                      <StatusPill tone={qcTone(batch.qc_status)}>
                        {batch.qc_status || 'PENDING'}
                      </StatusPill>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openDecision('qc', batch)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && qcRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH QA RELEASE
          ======================================================== */}
      {tab === 'qa' && (
        <div className="inv-panel">
          <div className="inv-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0' }}>Batches Awaiting QA Release</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Final quality assurance verification and batch release clearance.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search batches…"
                value={qaSearch}
                onChange={(e) => setQaSearch(e.target.value)}
                className="company-input"
                style={{ width: 190 }}
              />
              <div className="qc-filter-group">
                {QA_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={qaFilter === f ? 'qc-filter active' : 'qc-filter'}
                    onClick={() => setQaFilter(f)}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>QC Status</th>
                  <th>QA Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qaRows.map((batch) => {
                  const qcCleared = batch.qc_status === 'APPROVED'
                  return (
                    <tr key={batch.id}>
                      <td className="cell-strong">{batch.number}</td>
                      <td>{batch.company_name}</td>
                      <td>{batch.product_name}</td>
                      <td>
                        <StatusPill tone={qcTone(batch.qc_status)}>
                          {batch.qc_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <StatusPill tone={qaTone(batch.qa_status)}>
                          {batch.qa_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <Button
                          variant={batch.qa_status === 'PENDING' ? 'primary' : 'secondary'}
                          disabled={!qcCleared}
                          title={qcCleared ? undefined : 'Awaiting QC approval'}
                          onClick={() => openDecision('qa', batch)}
                        >
                          {batch.qa_status === 'PENDING' ? 'Take Approval' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && qaRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          BATCH TRACEABILITY
          ======================================================== */}
      {tab === 'trace' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batch traceability</h3>
          </div>

          <div className="field qc-trace-picker">
            <label className="field-label">Select a batch</label>
            <select
              className="field-input"
              value={traceBatchId}
              onChange={(e) => loadTrace(e.target.value)}
            >
              <option value="">Select batch to trace</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.number} — {batch.company_name} — {batch.product_name}
                </option>
              ))}
            </select>
          </div>

          {traceLoading && <p className="inv-empty">Loading traceability…</p>}
          {traceError && <Alert type="error">{traceError}</Alert>}

          {!traceLoading && !traceError && selectedTraceBatch && (
            <div className="qc-trace-grid">
              <div className="qc-trace-block">
                <h4>Batch summary</h4>
                <dl>
                  <div>
                    <dt>Batch</dt>
                    <dd>{selectedTraceBatch.number}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{selectedTraceBatch.company_name}</dd>
                  </div>
                  <div>
                    <dt>Product</dt>
                    <dd>{selectedTraceBatch.product_name}</dd>
                  </div>
                  <div>
                    <dt>Formula</dt>
                    <dd>{selectedTraceBatch.formula_name}</dd>
                  </div>
                  <div>
                    <dt>Order</dt>
                    <dd>{selectedTraceBatch.order_number || '—'}</dd>
                  </div>
                  <div>
                    <dt>Planned / Produced</dt>
                    <dd>
                      {selectedTraceBatch.planned_quantity} / {selectedTraceBatch.produced_quantity}
                    </dd>
                  </div>
                  <div>
                    <dt>QC / QA</dt>
                    <dd>
                      <StatusPill tone={qcTone(selectedTraceBatch.qc_status)}>
                        {selectedTraceBatch.qc_status || 'PENDING'}
                      </StatusPill>{' '}
                      <StatusPill tone={qaTone(selectedTraceBatch.qa_status)}>
                        {selectedTraceBatch.qa_status || 'PENDING'}
                      </StatusPill>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="qc-trace-block">
                <h4>Material consumption</h4>
                {trace?.material_consumption?.length ? (
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Lot</th>
                        <th>Qty</th>
                        <th>Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.material_consumption.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.item_code} — {row.item_name}</td>
                          <td>{row.lot_number}</td>
                          <td>{row.quantity} {row.uom}</td>
                          <td>{row.issued_at ? new Date(row.issued_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="inv-empty">
                    No consumption data returned by the backend yet.
                  </p>
                )}
              </div>

              <div className="qc-trace-block">
                <h4>QC / QA history</h4>
                <ul className="qc-timeline">
                  {[...(trace?.qc_history || []), ...(trace?.qa_history || [])].length ? (
                    [...(trace?.qc_history || []), ...(trace?.qa_history || [])].map(
                      (event, idx) => (
                        <li key={idx}>
                          <strong>{event.decision}</strong> — {event.remarks || 'No remarks'}
                          <span>{event.by} · {event.at ? new Date(event.at).toLocaleString() : ''}</span>
                        </li>
                      )
                    )
                  ) : (
                    <p className="inv-empty">No QC/QA decisions recorded yet.</p>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          FORMULA APPROVALS (QC & QA CERTIFICATION)
          ======================================================== */}
      {tab === 'formula_approvals' && (
        <div className="inv-panel">
          {/* Header & Subtitle */}
          <div className="qc-formula-header-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="qc-formula-title-area">
              <h3 style={{ margin: '0 0 6px 0', color: '#123f61' }}>
                Master Formulation Stoichiometric Approvals
              </h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13.5px' }}>
                Review live batch formulation calculation engine snapshots, verify stoichiometric ratios, and approve or decline with documented findings.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {companies.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Company:</span>
                  <select
                    className="company-input"
                    value={companyId || effectiveCompanyId}
                    onChange={(e) => setCompanyId(Number(e.target.value))}
                    style={{ minWidth: '160px', height: '36px', fontWeight: 600, fontSize: '13px', padding: '4px 10px' }}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name || c.name || c.code}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                variant="secondary"
                loading={loadingFormulaApprovals}
                onClick={loadApiFormulaApprovals}
                style={{ padding: '6px 14px', fontSize: '13px' }}
              >
                🔄 Refresh Live Data
              </Button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="qc-formula-kpi-grid">
            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#f0f9ff', color: '#0369a1' }}>📑</div>
              <div className="kpi-content">
                <span className="kpi-label">Total Requests</span>
                <span className="kpi-value" style={{ color: '#0369a1' }}>{totalFormulaRequests}</span>
                <span className="kpi-sub">All submissions</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#fef3c7', color: '#b45309' }}>⏳</div>
              <div className="kpi-content">
                <span className="kpi-label">Pending QC Review</span>
                <span className="kpi-value" style={{ color: '#b45309' }}>{pendingFormulaApprovals}</span>
                <span className="kpi-sub">Action required</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#dcfce7', color: '#15803d' }}>✓</div>
              <div className="kpi-content">
                <span className="kpi-label">Approved Formulas</span>
                <span className="kpi-value" style={{ color: '#15803d' }}>{approvedFormulaApprovals}</span>
                <span className="kpi-sub">BMR Certified</span>
              </div>
            </div>

            <div className="qc-kpi-card">
              <div className="kpi-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>✕</div>
              <div className="kpi-content">
                <span className="kpi-label">Declined Formulations</span>
                <span className="kpi-value" style={{ color: '#b91c1c' }}>{declinedFormulaApprovals}</span>
                <span className="kpi-sub">Returned with findings</span>
              </div>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="qc-formula-toolbar">
            <div className="qc-toolbar-left">
              <div className="field-group" style={{ margin: 0 }}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Search by Request ID, Product, Formula, or Submitter..."
                  value={formulaSearch}
                  onChange={(e) => setFormulaSearch(e.target.value)}
                  style={{ width: '320px', maxWidth: '100%' }}
                />
              </div>

              <div className="filter-pill-group">
                {FORMULA_STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`filter-pill ${formulaStatusFilter === s ? 'active' : ''}`}
                    onClick={() => setFormulaStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {(formulaSearch || formulaStatusFilter !== 'ALL') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFormulaSearch('')
                  setFormulaStatusFilter('ALL')
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="qc-table-wrapper" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginTop: '14px' }}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Request ID</th>
                  <th>Product Details</th>
                  <th>Master Formula &amp; Revision</th>
                  <th style={{ width: '130px' }}>Target Batch Qty</th>
                  <th style={{ width: '100px' }}>Ingredients</th>
                  <th>Submitted By</th>
                  <th style={{ width: '110px' }}>QC Status</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFormulaRequests.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                      <div style={{ fontWeight: 600, color: '#123f61', fontSize: '15px' }}>
                        No Formula Approval Requests Found
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                        {formulaSearch || formulaStatusFilter !== 'ALL'
                          ? 'No requests match your current search and filter criteria.'
                          : 'No formula calculations have been submitted for QC approval yet.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredFormulaRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <span className="req-id-tag">{req.id}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#123f61' }}>{req.productName}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Code: <strong>{req.productCode}</strong> • Form: {req.dosageForm || 'Oral Liquid'}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#334155' }}>{req.formulaName}</div>
                        <div style={{ fontSize: '12px', color: '#0f766e', fontWeight: 500 }}>
                          {req.revisionName} (Base: {req.formulaBaseQuantity} {req.formulaBaseUnit})
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {req.batchQuantity} {req.batchUnit}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {req.scaleFactor}× Scale
                        </div>
                      </td>
                      <td>
                        <span className="ingredient-count-badge">
                          {req.ingredientsCount ?? req.materialsCount ?? req.materials?.length ?? 0} Materials
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#334155' }}>{req.submittedBy}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString('en-GB') : '—'}
                        </div>
                      </td>
                      <td>
                        {req.status === 'APPROVED' ? (
                          <span className="qc-status-pill pill-approved">✓ Approved</span>
                        ) : req.status === 'PENDING' ? (
                          <span className="qc-status-pill pill-pending">⏳ Pending QC</span>
                        ) : req.status === 'DECLINED' ? (
                          <span className="qc-status-pill pill-declined">✕ Declined</span>
                        ) : (
                          <span className="qc-status-pill pill-neutral">{req.status}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant={req.status === 'PENDING' ? 'primary' : 'secondary'}
                          onClick={() => handleOpenReviewModal(req)}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          Review Formula →
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ORDER QC INSPECTION
          ======================================================== */}
      {orderQcModal && (
        <Modal
          title={`Order QC Inspection — ${orderQcModal.number}`}
          onClose={() => !saving && setOrderQcModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => setOrderQcModal(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQc('FAIL')}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  ✗ Fail Inspection
                </Button>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQc('PARTIAL')}
                >
                  ⚠️ Partial Pass
                </Button>
                <Button
                  loading={saving}
                  onClick={() => submitOrderQc('PASS')}
                >
                  ✓ Pass Inspection
                </Button>
              </div>
            </div>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Order Number</dt>
                <dd><strong>{orderQcModal.order_number}</strong></dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{orderQcModal.customer_name}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{orderQcModal.company_name}</dd>
              </div>
              <div>
                <dt>Ordered Quantity</dt>
                <dd><strong>{orderQcModal.ordered_qty} units</strong></dd>
              </div>
            </dl>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Inspection Parameters Checklist</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.appearance === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, appearance: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Appearance &amp; Packaging Integrity
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.packaging === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, packaging: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Physical &amp; Chemical Specifications
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.labeling === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, labeling: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Labeling, Batch &amp; Expiry Legibility
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qcParams.specs === 'PASS'}
                onChange={(e) => setQcParams(p => ({ ...p, specs: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Weight / Volume Variation Check
            </label>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Inspection Quantities</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="field">
              <label className="field-label">Inspected Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcInspectedQty}
                onChange={(e) => setQcInspectedQty(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label className="field-label">Accepted Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcAcceptedQty}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0
                  setQcAcceptedQty(val)
                  setQcRejectedQty(Math.max((qcInspectedQty || 0) - val, 0))
                }}
              />
            </div>
            <div className="field">
              <label className="field-label">Rejected Quantity</label>
              <input
                className="field-input"
                type="number"
                value={qcRejectedQty}
                onChange={(e) => setQcRejectedQty(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="field field-full">
            <label className="field-label">Inspection Remarks / Failure Reason</label>
            <textarea
              className="field-input"
              rows={3}
              value={qcRemarks}
              onChange={(e) => setQcRemarks(e.target.value)}
              placeholder="State observations, reasons for rejection or conditional acceptance..."
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: ORDER QA RELEASE
          ======================================================== */}
      {orderQaModal && (
        <Modal
          title={`Order QA Release Sign-off — ${orderQaModal.number}`}
          onClose={() => !saving && setOrderQaModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => setOrderQaModal(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => submitOrderQa('REJECT')}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  ✗ Reject Release
                </Button>
                <Button
                  loading={saving}
                  onClick={() => submitOrderQa('APPROVE')}
                >
                  ✓ Authorize QA Release (Make Billable)
                </Button>
              </div>
            </div>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Order Number</dt>
                <dd><strong>{orderQaModal.order_number}</strong></dd>
              </div>
              <div>
                <dt>QC Reference</dt>
                <dd>{orderQaModal.qc_number}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{orderQaModal.customer_name}</dd>
              </div>
              <div>
                <dt>QC Accepted Qty</dt>
                <dd style={{ color: '#16a34a', fontWeight: 600 }}>{orderQaModal.qc_accepted_qty} units</dd>
              </div>
            </dl>
          </div>

          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>QA Release Sign-off Verification</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.bmr_review === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, bmr_review: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Batch Manufacturing Record (BMR) &amp; Packaging Records Complete &amp; Verified
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.coa_verification === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, coa_verification: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Certificate of Analysis (CoA) Conforms to IP/BP Pharmacopoeia Standards
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={qaParams.compliance_signoff === 'PASS'}
                onChange={(e) => setQaParams(p => ({ ...p, compliance_signoff: e.target.checked ? 'PASS' : 'FAIL' }))}
              />
              Regulatory &amp; Statutory Clearance for Commercial Sale &amp; Invoicing
            </label>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label className="field-label">Approved Billable Quantity (Units to Invoice)</label>
            <input
              className="field-input"
              type="number"
              value={qaApprovedQty}
              onChange={(e) => setQaApprovedQty(Number(e.target.value) || 0)}
            />
            <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
              This QA-approved quantity becomes the maximum billable quantity when creating an invoice.
            </span>
          </div>

          <div className="field field-full">
            <label className="field-label">QA Sign-off Remarks</label>
            <textarea
              className="field-input"
              rows={3}
              value={qaRemarks}
              onChange={(e) => setQaRemarks(e.target.value)}
              placeholder="Enter release authorization notes or conditions of sale..."
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: BATCH DECISION
          ======================================================== */}
      {decisionModal && (
        <Modal
          title={
            decisionModal.type === 'qc'
              ? `QC review — ${decisionModal.batch.number}`
              : `QA release — ${decisionModal.batch.number}`
          }
          onClose={closeDecision}
          footer={
            <>
              <Button variant="secondary" onClick={closeDecision} disabled={saving}>
                Cancel
              </Button>

              {decisionModal.type === 'qc' ? (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('REJECT')}
                  >
                    Reject
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('APPROVE')}>
                    Approve QC
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('HOLD')}
                  >
                    Hold
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('RELEASE')}>
                    Release QA
                  </Button>
                </>
              )}
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Company</dt>
                <dd>{decisionModal.batch.company_name}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>{decisionModal.batch.product_name}</dd>
              </div>
              <div>
                <dt>Produced quantity</dt>
                <dd>{decisionModal.batch.produced_quantity}</dd>
              </div>
            </dl>
          </div>

          <div className="field field-full">
            <label className="field-label">Remarks</label>
            <textarea
              className="field-input"
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add QC/QA remarks (visible in batch traceability)"
            />
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: FORMULA APPROVAL REVIEW (BMR DOCUMENT SLIP)
          ======================================================== */}
      {reviewFormulaModal && (
        <Modal
          title={`Formula Stoichiometric Audit Review — ${reviewFormulaModal.id}`}
          onClose={() => setReviewFormulaModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportFormulaExcel({
                      product: {
                        name: reviewFormulaModal.productName,
                        code: reviewFormulaModal.productCode,
                      },
                      formula: {
                        name: reviewFormulaModal.formulaName,
                        base_quantity: reviewFormulaModal.formulaBaseQuantity,
                        base_unit: reviewFormulaModal.formulaBaseUnit,
                      },
                      revision: { name: reviewFormulaModal.revisionName },
                      materials: reviewFormulaModal.materials || [],
                      batchQty: reviewFormulaModal.batchQuantity,
                      batchUnit: reviewFormulaModal.batchUnit,
                      scaleFactor: reviewFormulaModal.scaleFactor,
                      approval: reviewFormulaModal,
                      companyName: activeCompanyId === 3 ? 'TEJ BIOCARE HEALTHCARE PVT. LTD.' : 'CMHP PHARMACEUTICALS PVT. LTD.',
                    })
                  }
                >
                  📊 Export Excel (.xls)
                </Button>
                <Button variant="secondary" onClick={() => exportFormulaPrint()}>
                  🖨️ Print / Save PDF
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button variant="secondary" onClick={() => setReviewFormulaModal(null)}>
                  Close
                </Button>

                {reviewFormulaModal.status === 'PENDING' && (
                  <>
                    <Button
                      variant="danger"
                      onClick={() => handleOpenDeclineModal(reviewFormulaModal)}
                    >
                      ✕ Decline Formulation
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleOpenApproveModal(reviewFormulaModal)}
                    >
                      ✓ Approve Formulation
                    </Button>
                  </>
                )}
              </div>
            </div>
          }
        >
          <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '10px 4px' }}>
            {reviewModalLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
                <div style={{ width: 44, height: 44, border: '4px solid #e2e8f0', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ color: '#475569', fontWeight: 600, fontSize: 15 }}>Loading formula materials…</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Fetching all ingredient lines from server</div>
              </div>
            ) : (
              <BmrRequisitionDocument
                product={{
                  name: reviewFormulaModal.productName,
                  code: reviewFormulaModal.productCode,
                  bmr_no: reviewFormulaModal.productBmrNo,
                  dosage_form: reviewFormulaModal.dosageForm,
                }}
                formula={{
                  name: reviewFormulaModal.formulaName,
                  code: reviewFormulaModal.formulaCode,
                  base_quantity: reviewFormulaModal.formulaBaseQuantity,
                  base_unit: reviewFormulaModal.formulaBaseUnit,
                }}
                revision={{ name: reviewFormulaModal.revisionName }}
                materials={reviewFormulaModal.materials || []}
                batchQty={reviewFormulaModal.batchQuantity}
                batchUnit={reviewFormulaModal.batchUnit}
                scaleFactor={reviewFormulaModal.scaleFactor}
                approval={reviewFormulaModal}
                companyName={activeCompanyId === 3 ? 'TEJ BIOCARE HEALTHCARE PVT. LTD.' : 'CMHP PHARMACEUTICALS PVT. LTD.'}
                companyCode={activeCompanyId === 3 ? 'TEJ' : 'CMHP'}
                department={
                  reviewFormulaModal.dosageForm === 'Syrups' || reviewFormulaModal.dosageForm === 'Suspension'
                    ? 'PRODUCTION ( ORAL LIQUID DEPARTMENT )'
                    : 'PRODUCTION ( ORAL SOLID DOSAGE DEPARTMENT )'
                }
              />
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: APPROVE FORMULA DIALOG
          ======================================================== */}
      {approveDialogModal && (
        <Modal
          title={`Approve Master Formulation — ${approveDialogModal.id}`}
          onClose={() => setApproveDialogModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setApproveDialogModal(null)} disabled={approving}>
                Cancel
              </Button>
              <Button onClick={handleConfirmApprove} disabled={approving}>
                {approving ? 'Approving…' : '✓ Confirm & Certify Formula'}
              </Button>
            </div>
          }
        >
          <div>
            {approveDialogError && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{approveDialogError}</Alert>
              </div>
            )}

            <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#334155' }}>
              You are certifying that the stoichiometric scaling for{' '}
              <strong>{approveDialogModal.productName}</strong> ({approveDialogModal.batchQuantity}{' '}
              {approveDialogModal.batchUnit}) meets all pharmaceutical quality standards and BMR release criteria.
            </p>

            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Formula:</span>
                <span style={{ fontWeight: 600 }}>{approveDialogModal.formulaName}</span>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>Revision:</span>
                <span style={{ fontWeight: 600 }}>{approveDialogModal.revisionName}</span>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Batch Scale:</span>
                <span style={{ fontWeight: 700, color: '#0f766e' }}>{approveDialogModal.scaleFactor}× Multiplier</span>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                QC Approval Remarks / BMR Release Endorsement (Optional)
              </label>
              <textarea
                className="field-input"
                rows="3"
                placeholder="e.g. Stoichiometric calculations verified against SOP/QA/04/F-02/00. Formula approved for commercial production."
                value={qcApprovalRemarks}
                onChange={(e) => setQcApprovalRemarks(e.target.value)}
              />
            </div>

            <Alert type="info">
              Approval will unlock official BMR Requisition Slip issuance and reflect live in the Products module.
            </Alert>
          </div>
        </Modal>
      )}

      {/* ========================================================
          MODAL: DECLINE FORMULA DIALOG (MANDATORY REASON)
          ======================================================== */}
      {declineDialogModal && (
        <Modal
          title={`Decline Formulation Calculation — ${declineDialogModal.id}`}
          onClose={() => setDeclineDialogModal(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setDeclineDialogModal(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDecline}>
                ✕ Confirm Decline &amp; Log Finding
              </Button>
            </div>
          }
        >
          <div>
            {declineValidationError && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{declineValidationError}</Alert>
              </div>
            )}

            <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#7f1d1d' }}>
              Declining will return this formula calculation to Production with documented non-compliance findings. A detailed analytical reason is strictly required.
            </p>

            <div className="field field-full" style={{ marginBottom: 14 }}>
              <label className="field-label">Discrepancy Category <span style={{ color: '#dc2626' }}>*</span></label>
              <select
                className="field-input"
                value={declineCategory}
                onChange={(e) => setDeclineCategory(e.target.value)}
              >
                {DECLINE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-full" style={{ marginBottom: 14 }}>
              <label className="field-label">
                Analytical Decline Reason <span style={{ color: '#dc2626' }}>* (Mandatory)</span>
              </label>
              <textarea
                className="field-input"
                rows="4"
                placeholder="Describe specific stoichiometric errors, out-of-spec ingredient ratios, pharmacopeial limits exceeded, or required formula adjustments..."
                value={declineReason}
                onChange={(e) => {
                  setDeclineReason(e.target.value)
                  if (declineValidationError && e.target.value.trim().length >= 5) {
                    setDeclineValidationError('')
                  }
                }}
                required
              />
              <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: 4, display: 'block' }}>
                Minimum 5 characters. This statement will be permanently recorded in the formula audit log.
              </span>
            </div>

            <Alert type="warning">
              Production will receive this finding and be prompted to adjust base active weights, excipients, or batch parameters before resubmitting.
            </Alert>
          </div>
        </Modal>
      )}
    </div>
  )
}