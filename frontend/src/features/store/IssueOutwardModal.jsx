import { useEffect, useRef, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { confirmAction } from '../../components/ConfirmProvider'
import { LoadingState } from '../../components/Spinner'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import { getErrorMessage } from '../../utils/errors'
import { createMaterialIssue, getAvailableToIssue, postMaterialIssue, updateMaterialIssue } from './materialIssueService'
import './RegisterModalTheme.css'

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Real Issue Outward capture (apps.stock_movements.services.
// create_material_issue/update_material_issue/post_material_issue) -
// Save Draft and Post Issue are two separate, explicit actions (Post
// only once a draft exists, and only when the caller holds
// stock_issue.post in this store - the server stays authoritative
// regardless). The quantity cap shown and enforced here is a plain
// received-minus-issued ledger number (never a claim about QC release,
// reservation, or usable-stock eligibility - see net_recorded_balances's
// own docstring); it is deliberately NEVER labelled "Eligible Available
// Stock" - no ownership/QC/hold policy exists yet to make that claim
// true, and posting is capped by this honest ledger number instead of
// being blocked outright, a decision made (and disclosed) earlier in
// this project rather than invented silently here.
export default function IssueOutwardModal({ storeId, materialId, materialCode, materialName, onClose, onIssued, onPosted }) {
  const [balances, setBalances] = useState({ loading: true, rows: [], error: '' })
  const [codes, setCodes] = useState([])
  const [sourceCompanyId, setSourceCompanyId] = useState('')
  const [issuedAt, setIssuedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()))
  const [issuedQuantity, setIssuedQuantity] = useState('')
  const [batchReference, setBatchReference] = useState('')
  const [productReference, setProductReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const postingRef = useRef(false)
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    getAvailableToIssue(storeId, materialId)
      .then((rows) => {
        setBalances({ loading: false, rows, error: '' })
        // Only one company has recorded receipts for this material -
        // the common case - so there is nothing to actually choose.
        const withStock = rows.filter((r) => Number(r.net_quantity) > 0)
        if (withStock.length === 1) setSourceCompanyId(String(withStock[0].source_company_id))
      })
      .catch((err) => setBalances({ loading: false, rows: [], error: getErrorMessage(err) }))
    getStorePermissionCodes(storeId).then(setCodes).catch(() => setCodes([]))
  }, [storeId, materialId])

  const canPost = codes.includes('stock_issue.post')
  const selectedBalance = balances.rows.find((r) => String(r.source_company_id) === String(sourceCompanyId))
  const netAvailable = selectedBalance ? Number(selectedBalance.net_quantity) : null
  const exceedsAvailable = netAvailable != null && Number(issuedQuantity) > netAvailable

  const markDirty = () => setDirty(true)

  const requestClose = async () => {
    if (saving || posting) return
    if (dirty) {
      const discard = await confirmAction(
        'You have unsaved changes to this issue entry. Close without saving?',
        { confirmLabel: 'Discard changes', title: 'Discard unsaved changes?', danger: true }
      )
      if (!discard) return
    }
    onClose()
  }

  const saveDraft = async () => {
    if (savingRef.current) return
    if (!sourceCompanyId || !issuedQuantity || !productReference.trim() || !issuedAt) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const issue = draft
        ? await updateMaterialIssue(storeId, draft.id, {
            expected_version: draft.version,
            issued_quantity: issuedQuantity,
            issued_at: new Date(issuedAt).toISOString(),
            batch_reference: batchReference.trim(),
            product_reference: productReference.trim(),
            remarks: remarks.trim(),
          })
        : await createMaterialIssue(storeId, {
            source_company_id: Number(sourceCompanyId),
            material_id: materialId,
            issued_quantity: issuedQuantity,
            issued_at: new Date(issuedAt).toISOString(),
            batch_reference: batchReference.trim(),
            product_reference: productReference.trim(),
            remarks: remarks.trim(),
            idempotency_key: idempotencyKeyRef.current,
          })
      setDraft(issue)
      setDirty(false)
      if (onIssued) onIssued(issue)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const doPost = async () => {
    if (postingRef.current || !draft) return
    const proceed = await confirmAction(
      `Post issue ${draft.reference} for ${draft.issued_quantity} to ${draft.product_reference}? ` +
      'This records a real stock-reducing movement - it cannot be undone through this form.',
      { confirmLabel: 'Post issue', title: 'Confirm Issue Outward', danger: false }
    )
    if (!proceed) return

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

  return (
    <Modal
      className="reg-modal-themed"
      title={`+ Issue Material Outward${materialCode ? `: ${materialCode}${materialName ? ` — ${materialName}` : ''}` : ''}`}
      size="md"
      onClose={saving_or_posting ? undefined : requestClose}
      footer={
        <>
          <Button variant="secondary" onClick={requestClose} disabled={saving_or_posting}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={saveDraft}
            loading={saving}
            disabled={
              saving_or_posting || !sourceCompanyId || !issuedQuantity || !productReference.trim() ||
              (draft != null && draft.status !== 'DRAFT')
            }
          >
            {draft ? 'Update Draft' : 'Save Draft'}
          </Button>
          {draft && draft.status === 'DRAFT' && (
            <Button
              onClick={doPost}
              disabled={saving_or_posting || !canPost || exceedsAvailable}
              loading={posting}
              title={
                !canPost
                  ? 'You do not hold stock_issue.post in this store - ask an administrator for access.'
                  : exceedsAvailable
                    ? `Exceeds the recorded net balance of ${netAvailable} - edit the quantity and save the draft again before posting.`
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

      {balances.loading ? (
        <LoadingState label="Loading recorded balances…" compact />
      ) : balances.error ? (
        <Alert type="error">{balances.error}</Alert>
      ) : balances.rows.length === 0 ? (
        <p className="field-muted">No recorded receipts exist for this material at this store yet - nothing is available to issue.</p>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="issue-company">Destination company *</label>
            <select
              id="issue-company"
              className="field-input"
              value={sourceCompanyId}
              onChange={(e) => { setSourceCompanyId(e.target.value); markDirty() }}
              disabled={draft != null}
            >
              <option value="">Choose…</option>
              {balances.rows.map((row) => (
                <option key={row.source_company_id} value={row.source_company_id}>
                  {row.source_company_code} — {row.net_quantity} {row.unit_code} available
                </option>
              ))}
            </select>
            <p className="field-muted">
              Recorded receipts minus recorded issues for this company at this store - a ledger balance only, not a
              QC-released or reservation status. Fixed once a draft is saved (immutable after creation).
            </p>
          </div>

          {selectedBalance && (
            <p className="field-muted">
              Available to issue: <strong>{selectedBalance.net_quantity} {selectedBalance.unit_code}</strong>
              {' '}({selectedBalance.recorded_receipt_quantity} received − {selectedBalance.recorded_issued_quantity} already issued)
            </p>
          )}

          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="issue-date">Issue date *</label>
              <input id="issue-date" className="field-input" type="datetime-local" value={issuedAt} onChange={(e) => { setIssuedAt(e.target.value); markDirty() }} disabled={draft?.status === 'POSTED'} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="issue-qty">Issued quantity{selectedBalance ? ` (${selectedBalance.unit_code})` : ''} *</label>
              <input id="issue-qty" className="field-input" type="number" step="any" min="0" value={issuedQuantity} onChange={(e) => { setIssuedQuantity(e.target.value); markDirty() }} disabled={draft?.status === 'POSTED'} />
              {exceedsAvailable && (
                <p className="field-error">Exceeds the recorded net balance of {netAvailable} {selectedBalance?.unit_code}. Postable only after this is reduced.</p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="issue-batch">Official production batch no (optional)</label>
              <input id="issue-batch" className="field-input" value={batchReference} onChange={(e) => { setBatchReference(e.target.value); markDirty() }} disabled={draft?.status === 'POSTED'} maxLength={100} placeholder="e.g. GH2609 or NA" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="issue-product">Name of product / formulation *</label>
              <input id="issue-product" className="field-input" value={productReference} onChange={(e) => { setProductReference(e.target.value); markDirty() }} disabled={draft?.status === 'POSTED'} maxLength={255} placeholder="Free text - not linked to the Product catalog" />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="issue-remarks">Remarks (optional)</label>
            <input id="issue-remarks" className="field-input" value={remarks} onChange={(e) => { setRemarks(e.target.value); markDirty() }} disabled={draft?.status === 'POSTED'} maxLength={2000} />
            <p className="field-muted" style={{ margin: '4px 0 0' }}>
              Informational only - remarks never drive the recorded quantity or stock arithmetic above.
            </p>
          </div>
        </>
      )}
    </Modal>
  )
}
