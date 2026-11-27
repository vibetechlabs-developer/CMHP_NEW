// Real Issue Outward capture (apps.stock_movements.services.
// create_material_issue/update_material_issue/post_material_issue) -
// restored to junior's clean modal presentation, pale-blue header, rounded
// corners, compact field layout, batch derivation, and .stock-computed-box
// calculation panel.
//
// Save Draft and Post Issue are two separate, explicit actions (Post only
// once a draft exists, and only when caller holds stock_issue.post in this store).
// Product is derived consistently from the batch plan when available.
import { useEffect, useRef, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { LoadingState } from '../../components/Spinner'
import { useConfirmDialog } from '../inventory/components/ConfirmDialog'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import { getErrorMessage } from '../../utils/errors'
import {
  createMaterialIssue,
  getAvailableToIssue,
  getMaterialIssue,
  postMaterialIssue,
  updateMaterialIssue,
} from './materialIssueService'
import MaterialSearchSelect from './MaterialSearchSelect'
import BatchPlanSearchSelect from '../manufacturing/BatchPlanSearchSelect'
import '../inventory/tabs/StockLedger.css'
import '../inventory/tabs/CommonInventory.css'

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function IssueOutwardModal({
  storeId,
  materialId,
  materialCode,
  materialName,
  initialBatchReference,
  initialProductReference,
  initialQuantity,
  initialCompanyId,
  initialRemarks,
  editIssueId,
  onClose,
  onIssued,
  onPosted,
}) {
  const { confirm, ConfirmNode } = useConfirmDialog()
  const [selectedMaterialId, setSelectedMaterialId] = useState(materialId ? String(materialId) : '')
  const [activeMaterial, setActiveMaterial] = useState(null)
  const [balances, setBalances] = useState({ loading: false, rows: [], error: '' })
  const [codes, setCodes] = useState([])
  const [selectedBatchPlan, setSelectedBatchPlan] = useState(null)
  const [sourceCompanyId, setSourceCompanyId] = useState(initialCompanyId ? String(initialCompanyId) : '')
  const [issuedAt, setIssuedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()))
  const [issuedQuantity, setIssuedQuantity] = useState(initialQuantity ? String(initialQuantity) : '')
  const [batchReference, setBatchReference] = useState(initialBatchReference || '')
  const [selectedBatchPlanId, setSelectedBatchPlanId] = useState('')
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState('')
  const [productReference, setProductReference] = useState(initialProductReference || '')
  const [remarks, setRemarks] = useState(initialRemarks || '')
  const [extraLines, setExtraLines] = useState([]) // additional materials for multi-line slip
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const postingRef = useRef(false)
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const effectiveMaterialId = selectedMaterialId || (materialId ? String(materialId) : '')
  const effectiveCode = materialCode || activeMaterial?.code || (draft?.material_code_snapshot || '')
  const effectiveName = materialName || activeMaterial?.name || (draft?.material_name_snapshot || '')

  // Load existing issue when editing
  useEffect(() => {
    if (!editIssueId || !storeId) return
    getMaterialIssue(storeId, editIssueId)
      .then((issue) => {
        setDraft(issue)
        if (issue.source_company_id || issue.source_company) {
          setSourceCompanyId(String(issue.source_company_id || issue.source_company))
        }
        if (issue.issued_at) setIssuedAt(toLocalDateTimeInput(issue.issued_at))
        if (issue.issued_quantity) setIssuedQuantity(String(issue.issued_quantity))
        if (issue.batch_reference) setBatchReference(issue.batch_reference)
        if (issue.batch_plan_id) {
          setSelectedBatchPlan({ id: issue.batch_plan_id, official_batch_number: issue.batch_reference })
          setSelectedBatchPlanId(String(issue.batch_plan_id))
        }
        if (issue.sales_order_id) setSelectedSalesOrderId(String(issue.sales_order_id))
        if (issue.product_reference) setProductReference(issue.product_reference)
        if (issue.remarks) setRemarks(issue.remarks)
        if (issue.material_id) setSelectedMaterialId(String(issue.material_id))
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [storeId, editIssueId])

  // Fetch balances for effective material
  useEffect(() => {
    if (!storeId || !effectiveMaterialId) {
      setBalances({ loading: false, rows: [], error: '' })
      return
    }
    setBalances((prev) => ({ ...prev, loading: true, error: '' }))
    getAvailableToIssue(storeId, effectiveMaterialId)
      .then((rows) => {
        setBalances({ loading: false, rows, error: '' })
        const withStock = rows.filter((r) => Number(r.net_quantity) > 0)
        if (withStock.length === 1 && !sourceCompanyId) {
          setSourceCompanyId(String(withStock[0].source_company_id))
        }
      })
      .catch((err) => setBalances({ loading: false, rows: [], error: getErrorMessage(err) }))
  }, [storeId, effectiveMaterialId])

  useEffect(() => {
    getStorePermissionCodes(storeId).then(setCodes).catch(() => setCodes([]))
  }, [storeId])

  const canPost = codes.includes('stock_issue.post')
  const selectedBalance = balances.rows.find((r) => String(r.source_company_id) === String(sourceCompanyId))
  const netAvailable = selectedBalance ? Number(selectedBalance.net_quantity) : null
  const totalStoreStock = balances.rows.reduce((sum, r) => sum + (Number(r.net_quantity) || 0), 0)
  const storeUnit = balances.rows[0]?.unit_code || ''
  const exceedsAvailable = netAvailable != null && Number(issuedQuantity) > netAvailable

  const markDirty = () => setDirty(true)

  const requestClose = async () => {
    if (saving || posting) return
    if (dirty) {
      const ok = await confirm({
        title: 'Discard Changes?',
        message: 'You have unsaved changes in this issue entry. Close without saving?',
        confirmLabel: 'Yes, Discard',
        cancelLabel: 'Go Back',
        variant: 'warning',
        icon: '⚠️',
      })
      if (!ok) return
    }
    onClose()
  }

  const handleBatchSelect = (plan) => {
    setSelectedBatchPlan(plan)
    setSelectedBatchPlanId(plan ? String(plan.id) : '')
    setSelectedSalesOrderId(plan?.sales_order_id ? String(plan.sales_order_id) : '')
    setBatchReference(plan?.official_batch_number || (plan ? `Plan #${plan.id}` : ''))
    setProductReference(plan?.product_name || plan?.product_code || '')
    markDirty()
  }

  const handleIssueAndPost = async () => {
    if (savingRef.current || postingRef.current) return
    if (!selectedBatchPlanId && !selectedSalesOrderId) {
      setError('Select a batch plan (or sales order) before issuing material to production.')
      return
    }
    if (!sourceCompanyId || !issuedQuantity || Number(issuedQuantity) <= 0 || !productReference.trim() || !issuedAt) {
      setError('Please select a company, specify a positive issued quantity, destination product, and issue date.')
      return
    }
    if (exceedsAvailable) {
      setError(`Quantity exceeds the recorded net balance of ${netAvailable} ${selectedBalance?.unit_code || ''}.`)
      return
    }

    const saved = await saveDraft()
    if (saved && saved.id) {
      postingRef.current = true
      setPosting(true)
      setError('')
      try {
        const posted = await postMaterialIssue(storeId, saved.id, saved.version)
        setDraft(posted)
        if (onPosted) onPosted(posted)
        else if (onIssued) onIssued(posted)
      } catch (err) {
        setError(`Draft ${saved.reference} could not be posted: ${getErrorMessage(err)} It remains a draft and was not counted as issued.`)
      } finally {
        postingRef.current = false
        setPosting(false)
      }
    }
  }

  const saveDraft = async () => {
    if (savingRef.current) return null
    if (!selectedBatchPlanId && !selectedSalesOrderId) {
      setError('Select a batch plan (or sales order) before issuing material to production.')
      return null
    }
    if (!sourceCompanyId || !issuedQuantity || Number(issuedQuantity) <= 0 || !productReference.trim() || !issuedAt || !effectiveMaterialId) {
      setError('Please select a material, company, positive quantity, destination product, and issue date.')
      return null
    }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const lines = [
        { material_id: Number(effectiveMaterialId), issued_quantity: issuedQuantity },
        ...extraLines
          .filter((l) => l.material_id && Number(l.issued_quantity) > 0)
          .map((l) => ({ material_id: Number(l.material_id), issued_quantity: l.issued_quantity })),
      ]
      const bindPayload = {
        batch_plan_id: selectedBatchPlanId ? Number(selectedBatchPlanId) : null,
        sales_order_id: selectedSalesOrderId ? Number(selectedSalesOrderId) : null,
        batch_reference: batchReference.trim(),
        product_reference: productReference.trim(),
        remarks: remarks.trim(),
        lines,
      }
      const issue = draft
        ? await updateMaterialIssue(storeId, draft.id, {
            expected_version: draft.version,
            issued_at: new Date(issuedAt).toISOString(),
            ...bindPayload,
          })
        : await createMaterialIssue(storeId, {
            source_company_id: Number(sourceCompanyId),
            issued_at: new Date(issuedAt).toISOString(),
            idempotency_key: idempotencyKeyRef.current,
            ...bindPayload,
          })
      setDraft(issue)
      setDirty(false)
      if (onIssued) onIssued(issue)
      return issue
    } catch (err) {
      setError(getErrorMessage(err))
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const doPost = async () => {
    if (postingRef.current || !draft) return
    const ok = await confirm({
      title: 'Post Material Issue',
      message: `Post issue ${draft.reference} — ${draft.issued_quantity} ${selectedBalance?.unit_code || ''} to "${draft.product_reference}"?\n\nThis permanently deducts from store stock. Cannot be undone.`,
      confirmLabel: '📤 Post Issue',
      cancelLabel: 'Go Back',
      variant: 'danger',
      icon: '📤',
    })
    if (!ok) return

    postingRef.current = true
    setPosting(true)
    setError('')
    try {
      const posted = await postMaterialIssue(storeId, draft.id, draft.version)
      setDraft(posted)
      if (onPosted) onPosted(posted)
      else if (onIssued) onIssued(posted)
    } catch (err) {
      setError(`Draft ${draft.reference} could not be posted: ${getErrorMessage(err)} It remains a draft and was not counted as issued.`)
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const saving_or_posting = saving || posting
  const title = draft
    ? `Issue Outward Draft (${draft.reference}): ${effectiveCode || ''}${effectiveName ? ` — ${effectiveName}` : ''}`
    : `+ Issue Material Outward: ${effectiveCode || ''}${effectiveName ? ` — ${effectiveName}` : ''}`

  const isFormValid =
    !saving_or_posting &&
    Boolean(effectiveMaterialId) &&
    Boolean(sourceCompanyId) &&
    Boolean(selectedBatchPlanId || selectedSalesOrderId) &&
    Boolean(issuedQuantity) &&
    Number(issuedQuantity) > 0 &&
    Boolean(productReference.trim()) &&
    Boolean(issuedAt) &&
    !exceedsAvailable

  return (
    <Modal
      title={title}
      onClose={saving_or_posting ? () => {} : requestClose}
      maxWidth="640px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={saving_or_posting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={saveDraft}
            loading={saving}
            disabled={
              saving_or_posting || !effectiveMaterialId || !sourceCompanyId || !issuedQuantity || Number(issuedQuantity) <= 0 ||
              !productReference.trim() || (draft != null && draft.status !== 'DRAFT')
            }
          >
            {draft ? 'Update Draft' : 'Save Draft'}
          </Button>
          {!draft && (
            <button
              type="button"
              className="mreg-btn mreg-btn-outward"
              onClick={handleIssueAndPost}
              disabled={!isFormValid}
            >
              <span>📤</span> {saving_or_posting ? 'Posting Issue…' : 'Issue & Post to Ledger'}
            </button>
          )}
          {draft && draft.status === 'DRAFT' && (
            <Button
              type="button"
              onClick={doPost}
              disabled={saving_or_posting || !canPost || exceedsAvailable}
              loading={posting}
              title={
                !canPost
                  ? 'You do not hold stock_issue.post in this store - ask an administrator for access.'
                  : exceedsAvailable
                    ? `Exceeds the recorded net balance of ${netAvailable} - edit quantity before posting.`
                    : undefined
              }
            >
              Post Issue
            </Button>
          )}
        </>
      }
    >
      {error && <Alert type="error">{error}</Alert>}
      {draft && draft.status === 'DRAFT' && (
        <Alert type="success">
          Draft {draft.reference} saved. It has no stock effect yet - click Post Issue
          {canPost ? '' : ' (you do not hold stock_issue.post in this store)'} to record the movement.
        </Alert>
      )}
      {draft && draft.status === 'POSTED' && (
        <Alert type="success">Issue {draft.reference} posted. The register now reflects this consumption.</Alert>
      )}

      {/* Standalone Material Selector if materialId was not passed as a prop */}
      {!materialId && (
        <div className="stock-form-full" style={{ marginBottom: 12 }}>
          <label className="field-label" htmlFor="issue-material-select" style={{ marginBottom: 5, fontSize: 12, fontWeight: 700 }}>
            Select Material *
          </label>
          <MaterialSearchSelect
            id="issue-material-select"
            value={effectiveMaterialId}
            selected={activeMaterial || { id: effectiveMaterialId, code: effectiveCode, name: effectiveName }}
            onChange={(material) => {
              setActiveMaterial(material)
              setSelectedMaterialId(material ? String(material.id) : '')
              setSourceCompanyId('')
              handleBatchSelect(null)
            }}
            disabled={draft != null}
          />
        </div>
      )}

      {balances.loading ? (
        <LoadingState label="Loading recorded balances…" compact />
      ) : balances.error ? (
        <Alert type="error">{balances.error}</Alert>
      ) : !effectiveMaterialId ? (
        <Alert type="info">Please select a material above to view recorded warehouse balances.</Alert>
      ) : balances.rows.length === 0 ? (
        <Alert type="warning">
          No recorded receipts exist for this material at this store yet — nothing is available to issue.
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header pill info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: 8 }}>
            <div>
              <strong style={{ color: '#9a3412', fontSize: 13.5 }}>{effectiveCode} — {effectiveName}</strong>
              <div style={{ fontSize: 12, color: '#c2410c', marginTop: 2 }}>
                Current available: <strong>
                  {netAvailable != null
                    ? `${netAvailable} ${selectedBalance?.unit_code || ''}`
                    : balances.rows.length > 0
                    ? `${totalStoreStock.toFixed(3)} ${storeUnit} (select company below)`
                    : '0.000 in store'}
                </strong> · Outward Stock Issue
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#ffedd5', color: '#c2410c', padding: '3px 8px', borderRadius: 5 }}>
              OUTWARD
            </span>
          </div>

          {/* Destination Company selector */}
          <div className="stock-form-full">
            <label className="field-label" htmlFor="issue-company" style={{ marginBottom: 5, fontSize: 12 }}>
              Destination company *
            </label>
            <select
              id="issue-company"
              className="company-input"
              style={{ width: '100%', height: 40 }}
              value={sourceCompanyId}
              onChange={(e) => { setSourceCompanyId(e.target.value); handleBatchSelect(null) }}
              disabled={draft != null}
            >
              <option value="">Choose company…</option>
              {balances.rows.map((row) => (
                <option key={row.source_company_id} value={row.source_company_id}>
                  {row.source_company_code} — {row.net_quantity} {row.unit_code} available
                </option>
              ))}
            </select>
            {selectedBalance && (
              <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                Available to issue: <strong>{selectedBalance.net_quantity} {selectedBalance.unit_code}</strong>
                {' '}({selectedBalance.recorded_receipt_quantity} received − {selectedBalance.recorded_issued_quantity} already issued)
              </p>
            )}
          </div>

          {/* Form fields in grid */}
          <div className="stock-form-grid" style={{ marginBottom: 0 }}>
            <div>
              <label className="field-label" htmlFor="issue-date" style={{ marginBottom: 5, fontSize: 12 }}>
                Issue date *
              </label>
              <input
                id="issue-date"
                className="company-input"
                type="datetime-local"
                value={issuedAt}
                onChange={(e) => { setIssuedAt(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
                style={{ width: '100%', height: 38 }}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="issue-qty" style={{ marginBottom: 5, fontSize: 12 }}>
                Issued quantity{selectedBalance ? ` (${selectedBalance.unit_code})` : ''} *
              </label>
              <input
                id="issue-qty"
                className="company-input"
                type="number"
                step="any"
                min="0"
                placeholder={selectedBalance ? `Max: ${selectedBalance.net_quantity}` : '0'}
                value={issuedQuantity}
                onChange={(e) => { setIssuedQuantity(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
                style={{ width: '100%', height: 38 }}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="issue-batch" style={{ marginBottom: 5, fontSize: 12 }}>
                Batch plan / production batch *
              </label>
              <BatchPlanSearchSelect
                id="issue-batch"
                companyId={sourceCompanyId}
                value={selectedBatchPlanId}
                selected={selectedBatchPlan}
                onChange={handleBatchSelect}
                disabled={draft?.status === 'POSTED'}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="issue-product" style={{ marginBottom: 5, fontSize: 12 }}>
                Name of product / formulation *
              </label>
              <input
                id="issue-product"
                className="company-input"
                value={productReference}
                onChange={(e) => { setProductReference(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
                maxLength={255}
                placeholder="Product or formulation name"
                style={{ width: '100%', height: 38 }}
                required
              />
            </div>
          </div>

          <div className="stock-form-full">
            <label className="field-label" htmlFor="issue-remarks" style={{ marginBottom: 5, fontSize: 12 }}>
              Remarks (optional)
            </label>
            <input
              id="issue-remarks"
              className="company-input"
              value={remarks}
              onChange={(e) => { setRemarks(e.target.value); markDirty() }}
              disabled={draft?.status === 'POSTED'}
              maxLength={2000}
              placeholder="e.g. Stage 1 Granulation dispensing"
              style={{ width: '100%', height: 38 }}
            />
          </div>

          {/* Physical stock computation preview matching Excel sheet column PHYSICAL DRUM / TIN LTR */}
          {issuedQuantity && Number(issuedQuantity) > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: exceedsAvailable ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${exceedsAvailable ? '#fecaca' : '#bbf7d0'}`,
              borderRadius: 8, fontSize: 12.5,
            }}>
              <div>
                <span style={{ color: '#475569' }}>Current Stock: </span>
                <strong>{netAvailable != null ? `${netAvailable} ${selectedBalance?.unit_code || ''}` : '—'}</strong>
                <span style={{ margin: '0 6px', color: '#94a3b8' }}>−</span>
                <span style={{ color: '#ea580c' }}>Issue: </span>
                <strong>{issuedQuantity} {selectedBalance?.unit_code || ''}</strong>
              </div>
              <div>
                <span style={{ color: '#475569' }}>Physical Balance After Issue: </span>
                <strong style={{
                  color: exceedsAvailable ? '#dc2626' : '#16a34a',
                  fontSize: 14, fontWeight: 800,
                }}>
                  {netAvailable != null ? (netAvailable - Number(issuedQuantity)).toFixed(3) : '—'} {selectedBalance?.unit_code || ''}
                </strong>
              </div>
            </div>
          )}

          {/* Insufficient stock guard */}
          {exceedsAvailable && (
            <div className="stock-alert-insufficient" style={{ margin: '8px 0 0' }}>
              <span>⚠️</span>
              <span>
                Exceeds the recorded net balance of {netAvailable} {selectedBalance?.unit_code}. Postable only after this is reduced.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Themed dialogs */}
      {ConfirmNode}
    </Modal>
  )
}
