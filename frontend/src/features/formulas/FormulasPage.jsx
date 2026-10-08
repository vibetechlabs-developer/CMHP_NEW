import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { confirmAction } from '../../components/ConfirmProvider'
import usePermissions from '../../hooks/usePermissions'
import Modal from '../inventory/components/Modal'
import AsyncSearchSelect from '../operations/AsyncSearchSelect'
import { searchProducts } from '../operations/catalogLookupService'
import { listPlanningUnits } from '../operations/unitsLookupService'
import { getErrorMessage } from '../../utils/errors'
import Spinner, { LoadingState } from '../../components/Spinner'
import RequirementCalculator from './RequirementCalculator'
import {
  approvalActionState,
  approveRevision,
  buildRevisionLinesPayload,
  createFormula,
  createRevision,
  getApprovalPreview,
  getFormula,
  getRevision,
  listFormulas,
  listRevisions,
  searchMaterials,
  updateRevision,
} from './formulasService'
import './FormulasPage.css'

const PAGE_SIZE = 20
const RAW = 'RAW_MATERIAL'
const PACKAGING = 'PACKAGING_MATERIAL'

const WORKFLOW_STEPS = ['Choose a formula', 'Choose a revision', 'Add materials and save', 'Calculate and approve']

const reasonText =(reason) => (typeof reason === 'string' ? reason : reason?.message || reason?.code || JSON.stringify(reason))

// Formula Master: list, create, revisions, draft editor, approval and the
// requirement calculator. Every action is gated by the real permission codes.
// `embedded` renders the same components inside the order window's drawer.
export default function FormulasPage({ embedded = false, productId = null, lockedProduct = null } = {}) {
  const { loading: permissionsLoading, realCompanyId, hasPermission } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  // Inside the order window the product comes from the prop; on its own page, from the URL.
  const productFilter = embedded ? String(productId || '') : searchParams.get('product') || ''

  const canView = hasPermission('formulas.view')
  const canCreate = hasPermission('formulas.create')
  const canEdit = hasPermission('formulas.edit')
  const canApprove = hasPermission('formulas.approve')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [formulas, setFormulas] = useState([])
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [selectedFormulaId, setSelectedFormulaId] = useState(null)
  const [formula, setFormula] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [selectedRevisionId, setSelectedRevisionId] = useState(null)
  const [revision, setRevision] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [newRevisionOpen, setNewRevisionOpen] = useState(false)
  // Which material tables have unsaved edits. Switching away asks first.
  const [dirtyKinds, setDirtyKinds] = useState({})
  const hasUnsaved = Object.values(dirtyKinds).some(Boolean)

  const guardUnsaved = async () =>
    !hasUnsaved ||
    (await confirmAction('Discard the unsaved changes to this revision?', {
      confirmLabel: 'Discard',
      danger: true,
      title: 'Unsaved changes',
    }))

  // Closing or reloading the tab with unsaved material edits asks the browser to confirm.
  useEffect(() => {
    if (!hasUnsaved) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  const newFormula = async () => {
    if (await guardUnsaved()) setCreating(true)
  }

  // A different company or product drops every cached choice.
  useEffect(() => {
    setSelectedFormulaId(null)
    setSelectedRevisionId(null)
    setPage(1)
  }, [realCompanyId, productFilter])

  useEffect(() => {
    if (permissionsLoading || !realCompanyId || !canView) return
    let cancelled = false
    setListLoading(true)
    setListError('')
    listFormulas(realCompanyId, { search, productId: productFilter || undefined, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return
        setFormulas(data.results || [])
        setCount(data.count || 0)
      })
      .catch((error) => !cancelled && setListError(getErrorMessage(error)))
      .finally(() => !cancelled && setListLoading(false))
    return () => {
      cancelled = true
    }
  }, [permissionsLoading, realCompanyId, canView, search, productFilter, page])

  useEffect(() => {
    if (!realCompanyId || !selectedFormulaId) return
    let cancelled = false
    setDetailError('')
    Promise.all([getFormula(realCompanyId, selectedFormulaId), listRevisions(realCompanyId, selectedFormulaId)])
      .then(([detail, list]) => {
        if (cancelled) return
        setFormula(detail)
        setRevisions(list)
      })
      .catch((error) => !cancelled && setDetailError(getErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [realCompanyId, selectedFormulaId])

  useEffect(() => {
    if (!realCompanyId || !selectedFormulaId || !selectedRevisionId) {
      setRevision(null)
      return
    }
    let cancelled = false
    getRevision(realCompanyId, selectedFormulaId, selectedRevisionId)
      .then((data) => !cancelled && setRevision(data))
      .catch((error) => !cancelled && setDetailError(getErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [realCompanyId, selectedFormulaId, selectedRevisionId])

  const refreshRevisions = async () => {
    if (!realCompanyId || !selectedFormulaId) return
    setRevisions(await listRevisions(realCompanyId, selectedFormulaId))
    if (selectedRevisionId) setRevision(await getRevision(realCompanyId, selectedFormulaId, selectedRevisionId))
  }

  const chooseFormula = async (id) => {
    if (id === selectedFormulaId) return
    if (!(await guardUnsaved())) return
    setDirtyKinds({})
    setSelectedFormulaId(id)
    setSelectedRevisionId(null)
    setNotice('')
  }

  // Nothing is chosen automatically: the user picks the revision.
  const chooseRevision = async (id) => {
    if (id === selectedRevisionId) return
    if (!(await guardUnsaved())) return
    setDirtyKinds({})
    setSelectedRevisionId(id || null)
  }

  const searchBox = (
    <input
      type="search"
      className="field-input fm-search"
      placeholder="Search by formula code, name, or product"
      aria-label="Search formulas"
      value={search}
      onChange={(event) => {
        setSearch(event.target.value)
        setPage(1)
      }}
    />
  )

  if (permissionsLoading) {
    return (
      <section className="fm-page">
        <LoadingState label="Loading…" />
      </section>
    )
  }
  if (!realCompanyId) {
    return (
      <section className="fm-page">
        <Alert type="error">No company is selected.</Alert>
      </section>
    )
  }
  if (!canView) {
    return (
      <section className="fm-page">
        {!embedded && <h2 className="fm-title">Formulas</h2>}
        <p className="field-muted">Access unavailable. Ask an administrator for formula read access in this company.</p>
      </section>
    )
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  // Where the user is in the workflow, from the state already on screen.
  const currentStep = !selectedFormulaId ? 0 : !revision ? 1 : revision.status === 'DRAFT' ? 2 : 3

  return (
    <section className={embedded ? 'fm-page fm-embedded' : 'fm-page'}>
      {!embedded && (
        <header className="fm-head">
          <div>
            <h2 className="fm-title">Formulas</h2>
            <p className="fm-subtitle">Manage product formulas, revisions, and material requirements.</p>
          </div>
          <div className="fm-head-actions">
            {productFilter && (
              <Button variant="secondary" onClick={async () => (await guardUnsaved()) && setSearchParams({})}>
                Show All Formulas
              </Button>
            )}
            {canCreate && <Button onClick={newFormula}>+ New Formula</Button>}
          </div>
        </header>
      )}
      {embedded && canCreate && (
        <div className="fm-embed-actions">
          <Button onClick={newFormula}>+ New Formula</Button>
        </div>
      )}

      {notice && <Alert type="success">{notice}</Alert>}

      {embedded && (
        <div className="fm-toolbar">
          <div className="fm-toolbar-field">
            <label className="fm-field-label" htmlFor="fm-formula-select">
              Formula
            </label>
            <select
              id="fm-formula-select"
              className="field-input fm-formula-select"
              value={selectedFormulaId || ''}
              onChange={(event) => chooseFormula(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Choose a formula</option>
              {formulas.map((item) => (
                <option key={item.id} value={item.id}>
                  {`${item.code} — ${item.name}`}
                </option>
              ))}
            </select>
          </div>
          <div className="fm-toolbar-field fm-toolbar-search">
            <span className="fm-field-label">Find</span>
            {searchBox}
          </div>
        </div>
      )}

      <div className={embedded ? "fm-layout fm-layout-single" : "fm-layout"}>
        {!embedded && (
        <aside className="fm-list" aria-label="Formulas">
          {searchBox}
          {listError && <Alert type="error">{listError}</Alert>}
          {listLoading && <Spinner size="sm" tone="muted" label="Loading formulas…" />}
          {!listLoading && !listError && formulas.length === 0 && (
            <p className="field-muted">No formulas found{productFilter ? ' for this product' : ''}.</p>
          )}
          <ul className="fm-items">
            {formulas.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === selectedFormulaId ? 'fm-item active' : 'fm-item'}
                  onClick={() => chooseFormula(item.id)}
                  title={`${item.code} · ${item.name} · ${item.product_code}`}
                >
                  <span className="fm-item-name">{item.name}</span>
                  <span className="fm-item-code">{item.code}</span>
                  <span className="fm-item-product">
                    {item.product_code} · {item.product_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {count > PAGE_SIZE && (
            <div className="fm-pager">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="field-muted">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </aside>
        )}

        <div className="fm-detail">
          <ol className="fm-steps" aria-label="Formula workflow">
            {WORKFLOW_STEPS.map((label, index) => {
              const state = index < currentStep ? 'done' : index === currentStep ? 'current' : ''
              return (
                <li key={label} className={state ? `fm-step ${state}` : 'fm-step'} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="fm-step-no">{index < currentStep ? '✓' : index + 1}</span>
                  {label}
                </li>
              )
            })}
          </ol>

          {creating && (
            <FormulaCreateForm
              companyId={realCompanyId}
              lockedProduct={lockedProduct}
              onCancel={() => setCreating(false)}
              onCreated={(created) => {
                setCreating(false)
                setNotice(`Formula ${created.code} created as a draft. It is not approved.`)
                setSelectedFormulaId(created.id)
                setSearch('')
              }}
            />
          )}

          {detailError && <Alert type="error">{detailError}</Alert>}

          {!selectedFormulaId && !creating && (
            <p className="field-muted">Select a formula to see its revisions and material requirements.</p>
          )}

          {formula && (
            <>
              <header className="fm-detail-head">
                <h3 className="fm-detail-title">{formula.name}</h3>
                <p className="fm-detail-sub">
                  {formula.code} · {formula.product_code} · {formula.product_name}
                </p>
              </header>

              <div className="fm-revision-bar">
                <label className="fm-field-label" htmlFor="fm-revision-select">
                  Revision
                </label>
                <select
                  id="fm-revision-select"
                  className="field-input fm-revision-select"
                  value={selectedRevisionId || ''}
                  onChange={(event) => chooseRevision(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Choose a revision</option>
                  {revisions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {`Revision ${item.revision_number} — ${item.status === 'APPROVED' ? 'Approved' : 'Draft'} — ${item.base_output_quantity} ${item.output_uom_code}`}
                    </option>
                  ))}
                </select>
                {canEdit && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (await guardUnsaved()) setNewRevisionOpen(true)
                    }}
                  >
                    + New revision
                  </Button>
                )}
              </div>
              {revisions.length === 0 && <p className="field-muted">This formula has no revisions yet.</p>}
            </>
          )}

          {newRevisionOpen && formula && (
            <NewRevisionDialog
              companyId={realCompanyId}
              formulaId={formula.id}
              onCancel={() => setNewRevisionOpen(false)}
              onCreated={async (created) => {
                setNewRevisionOpen(false)
                setNotice(`Revision ${created.revision_number} created as a draft. It starts with an empty material list.`)
                setSelectedRevisionId(created.id)
                setDirtyKinds({})
                await refreshRevisions()
              }}
            />
          )}

          {revision && (
            <RevisionView
              key={revision.id}
              companyId={realCompanyId}
              formulaId={selectedFormulaId}
              revision={revision}
              canEdit={canEdit}
              canApprove={canApprove}
              onDirtyChange={(kind, dirty) => setDirtyKinds((prev) => ({ ...prev, [kind]: dirty }))}
              onRefresh={async () => setRevision(await getRevision(realCompanyId, selectedFormulaId, revision.id))}
              onChanged={async (message) => {
                if (message) setNotice(message)
                setDirtyKinds({})
                setRevision(await getRevision(realCompanyId, selectedFormulaId, revision.id))
                await refreshRevisions()
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function RevisionBadge({ status }) {
  const approved = status === 'APPROVED'
  return <span className={approved ? 'fm-badge approved' : 'fm-badge draft'}>{approved ? 'Approved' : 'Draft'}</span>
}

function FormulaCreateForm({ companyId, lockedProduct = null, onCancel, onCreated }) {
  const [product, setProduct] = useState(lockedProduct)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState(null)
  const [units, setUnits] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listPlanningUnits(companyId)
      .then((rows) => !cancelled && setUnits(rows))
      .catch(() => !cancelled && setUnits([]))
    return () => {
      cancelled = true
    }
  }, [companyId])

  const submit = async () => {
    if (saving) return
    if (!product || !code.trim() || !name.trim() || !quantity.trim() || !unit) {
      setError('Choose a product, enter a code and name, the base output quantity and its output unit.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createFormula(companyId, {
        product_id: Number(product.id),
        code: code.trim(),
        name: name.trim(),
        base_output_quantity: quantity.trim(),
        output_uom_id: Number(unit.id),
      })
      onCreated(created)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-card">
      <h3 className="fm-section-title">New formula</h3>
      <p className="field-muted">A new formula starts with a draft revision. Nothing is approved automatically.</p>
      <div className="fm-form-grid">
        <div className="field">
          <label className="fm-field-label">Product</label>
          {lockedProduct ? (
            <div className="field-input fm-locked" aria-readonly="true">
              {lockedProduct.label}
            </div>
          ) : (
            <AsyncSearchSelect
              id="fm-product"
              value={product?.id || ''}
              selected={product}
              onChange={setProduct}
              fetchOptions={(term) => searchProducts(companyId, term)}
              getOptionLabel={(o) => o.label}
              getOptionMeta={(o) => o.meta}
              placeholder="Search product"
            />
          )}
        </div>
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-code">Formula code</label>
          <input id="fm-code" className="field-input" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-name">Formula name</label>
          <input id="fm-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-qty">Base output quantity</label>
          <input id="fm-qty" className="field-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 100" />
        </div>
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-unit">Output unit</label>
          <select id="fm-unit" className="field-input" value={unit?.id || ''} onChange={(e) => setUnit(units.find((u) => String(u.id) === e.target.value) || null)}>
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="fm-actions">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} disabled={saving}>
          Create formula
        </Button>
      </div>
    </div>
  )
}

// A new revision starts EMPTY. Nothing is cloned from an earlier revision.
function NewRevisionDialog({ companyId, formulaId, onCancel, onCreated }) {
  const [quantity, setQuantity] = useState('')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listPlanningUnits(companyId)
      .then((rows) => !cancelled && setUnits(rows))
      .catch(() => !cancelled && setUnits([]))
    return () => {
      cancelled = true
    }
  }, [companyId])

  const submit = async () => {
    if (saving) return
    if (!quantity.trim() || !unitId) {
      setError('Enter the base output quantity and choose its output unit.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createRevision(companyId, formulaId, {
        base_output_quantity: quantity.trim(),
        output_uom_id: Number(unitId),
      })
      onCreated(created)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New revision"
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={saving}>
            Create draft
          </Button>
        </>
      }
    >
      <p className="field-muted">A new revision starts with an empty material list.</p>
      <div className="fm-form-grid fm-form-grid-single">
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-rev-qty">Base output quantity</label>
          <input id="fm-rev-qty" className="field-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="field">
          <label className="fm-field-label" htmlFor="fm-rev-unit">Output unit</label>
          <select id="fm-rev-unit" className="field-input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Choose a unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
    </Modal>
  )
}

// A draft shows its editable material tables and one Save draft action (both
// tables are saved together). An approved revision is read only.
function RevisionView({ companyId, formulaId, revision, canEdit, canApprove, onDirtyChange, onChanged, onRefresh }) {
  const isDraft = revision.status === 'DRAFT'
  const editable = isDraft && canEdit
  const unit = revision.output_uom_code

  const initialRows = (kind) =>
    (revision.lines || [])
      .filter((line) => line.material_type === kind)
      .map((line) => ({
        id: line.id,
        material: { id: line.material_id, code: line.material_code, name: line.material_name },
        unit: line.unit_code,
        quantity: line.quantity,
        notes: line.notes || '',
        label_claim: line.label_claim || '',
        special_value: line.special_value || '',
        ar_no: line.ar_no || '',
      }))

  const initialSnapshot = JSON.stringify({ [RAW]: initialRows(RAW), [PACKAGING]: initialRows(PACKAGING) })
  const [rowsByKind, setRowsByKind] = useState(() => ({ [RAW]: initialRows(RAW), [PACKAGING]: initialRows(PACKAGING) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const dirty = JSON.stringify(rowsByKind) !== initialSnapshot

  useEffect(() => {
    onDirtyChange(RAW, dirty)
    onDirtyChange(PACKAGING, dirty)
    // Reported once per change in this revision's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const save = async () => {
    // A new line needs its base quantity before the draft can be saved.
    const allRows = [...rowsByKind[RAW], ...rowsByKind[PACKAGING]]
    const missing = allRows.filter((row) => !String(row.quantity || '').trim())
    if (missing.length) {
      setError(`Enter the base quantity for: ${missing.map((row) => row.material.name).join(', ')}.`)
      return
    }
    // The server stores only quantities above zero.
    const notPositive = allRows.filter((row) => !(Number(String(row.quantity).trim()) > 0))
    if (notPositive.length) {
      setError(`The base quantity must be more than zero for: ${notPositive.map((row) => row.material.name).join(', ')}.`)
      return
    }
    setSaving(true)
    setError('')
    setSavedNote('')
    try {
      const lines = [
        ...buildRevisionLinesPayload({ allLines: [], kind: RAW, rows: rowsByKind[RAW] }),
        ...buildRevisionLinesPayload({ allLines: [], kind: PACKAGING, rows: rowsByKind[PACKAGING] }),
      ]
      await updateRevision(companyId, formulaId, revision.id, { expected_version: revision.version, lines })
      setSavedNote('Draft saved.')
      onChanged('Draft saved.')
    } catch (err) {
      if (err?.response?.status === 409) {
        // The revision moved on since it was loaded. Pick up the latest version and keep the rows on screen.
        setError('This revision was changed elsewhere. The latest version is loaded and your rows are kept. Check them and save again.')
        await onRefresh()
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-card">
      <section className="fm-section" aria-label="Formula and revision">
      <div className="fm-summary">
        <div>
          <span className="fm-summary-label">Base output</span>
          <strong>
            {revision.base_output_quantity} {unit}
          </strong>
        </div>
        <div>
          <span className="fm-summary-label">Status</span>
          <RevisionBadge status={revision.status} />
        </div>
        {revision.approved_at && (
          <div>
            <span className="fm-summary-label">Approved</span>
            <span>{new Date(revision.approved_at).toLocaleString()}</span>
          </div>
        )}
      </div>
      {!isDraft && <p className="fm-readonly-note">Approved revision. Read only.</p>}
      </section>

      <section className="fm-section" aria-label="Raw materials">
        <MaterialTable
          title="Raw materials"
          kind={RAW}
          rows={rowsByKind[RAW]}
          setRows={(next) => setRowsByKind((prev) => ({ ...prev, [RAW]: next }))}
          editable={editable}
        />
      </section>

      <section className="fm-section" aria-label="Packaging materials">
        <MaterialTable
          title="Packaging materials"
          kind={PACKAGING}
          rows={rowsByKind[PACKAGING]}
          setRows={(next) => setRowsByKind((prev) => ({ ...prev, [PACKAGING]: next }))}
          editable={editable}
        />
      </section>

      {editable && (
        <div className="fm-savebar" role="region" aria-label="Save draft">
          <div className="fm-save-status">
            <span className={saving ? 'fm-save-state saving' : dirty ? 'fm-save-state unsaved' : 'fm-save-state saved'} role="status" aria-live="polite">
              {saving ? 'Saving draft…' : dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <span className="fm-save-revision">Draft revision</span>
            {savedNote && !dirty && !saving && <span className="fm-save-ok">{savedNote}</span>}
          </div>
          {error && <p className="field-error fm-save-error" role="alert">{error}</p>}
          <Button onClick={save} loading={saving} disabled={saving || !dirty}>
            Save draft
          </Button>
        </div>
      )}

      <section className="fm-section" aria-label="Material requirements preview">
        <RequirementCalculator companyId={companyId} formulaId={formulaId} revisionId={revision.id} unitCode={unit} />
      </section>

      {isDraft && (
        <section className="fm-section" aria-label="Approval">
          <ApprovalPanel companyId={companyId} formulaId={formulaId} revision={revision} canApprove={canApprove} onApproved={onChanged} />
        </section>
      )}
    </div>
  )
}

function MaterialTable({ title, kind, rows, setRows, editable }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const addRow = (material) => {
    setRows([
      ...rows,
      {
        id: null,
        material: { id: material.id, code: material.code, name: material.name },
        unit: material.unitCode,
        quantity: '',
        notes: '',
        label_claim: '',
        special_value: '',
        ar_no: '',
      },
    ])
    setPickerOpen(false)
  }

  // A saved line is only removed from the draft when the draft is saved, so ask first.
  const removeRow = async (index, row) => {
    if (row.id != null) {
      const ok = await confirmAction(
        `Remove ${row.material.name} from this revision? It is removed from the draft when you save.`,
        { confirmLabel: 'Remove', danger: true, title: 'Remove material' }
      )
      if (!ok) return
    }
    setRows(rows.filter((_, i) => i !== index))
  }

  const emptyText = editable
    ? `No ${title.toLowerCase()} yet. Add a material to start this list.`
    : `No ${title.toLowerCase()} in this revision.`

  return (
    <section className="fm-lines" aria-label={title}>
      <div className="fm-lines-head">
        <div>
          <h4 className="fm-section-title">{title}</h4>
          <p className="fm-lines-count">{rows.length === 1 ? '1 line' : `${rows.length} lines`}</p>
        </div>
        {editable && !pickerOpen && (
          <Button variant="secondary" onClick={() => setPickerOpen(true)}>
            + Add material
          </Button>
        )}
      </div>
      {editable && pickerOpen && (
        <div className="fm-picker">
          <AsyncSearchSelect
            id={`fm-pick-${kind}`}
            value=""
            selected={null}
            onChange={(option) => option && option.kind === kind && addRow(option)}
            // A material already in this list is not offered again.
            fetchOptions={(term) =>
              searchMaterials(term, kind).then((options) => {
                const taken = new Set(rows.map((row) => row.material.id))
                return options.filter((option) => !taken.has(option.id))
              })
            }
            getOptionLabel={(o) => o.label}
            getOptionMeta={(o) => o.meta}
            placeholder={kind === RAW ? 'Search raw material' : 'Search packaging material'}
          />
          <Button variant="secondary" onClick={() => setPickerOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="fm-empty">{emptyText}</p>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <colgroup>
              <col className="fm-c-sr" />
              <col className="fm-c-material" />
              <col className="fm-c-qty" />
              <col className="fm-c-unit" />
              <col className="fm-c-text" />
              <col className="fm-c-text" />
              <col className="fm-c-ar" />
              {editable && <col className="fm-c-action" />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Sr.</th>
                <th scope="col">Material</th>
                <th scope="col" className="num">Base quantity</th>
                <th scope="col">Unit</th>
                <th scope="col">Special value</th>
                <th scope="col">Label claim</th>
                <th scope="col">AR No.</th>
                {editable && <th scope="col"><span className="fm-visually-hidden">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `new-${index}`}>
                  <td className="num fm-c-sr" data-label="Sr.">{index + 1}</td>
                  <td className="fm-cell-material" data-label="Material">
                    <span className="fm-cell-name" title={row.material.name}>
                      {row.material.name}
                    </span>
                    <span className="fm-cell-code">{row.material.code}</span>
                  </td>
                  <td className="num" data-label="Base quantity">
                    {editable ? (
                      <input
                        className="field-input fm-qty-input"
                        inputMode="decimal"
                        aria-label={`Base quantity for ${row.material.name}`}
                        value={row.quantity}
                        onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))}
                      />
                    ) : (
                      <span className="fm-num">{row.quantity || '—'}</span>
                    )}
                  </td>
                  <td data-label="Unit">{row.unit || '—'}</td>
                  <td data-label="Special value">
                    <FieldText value={row.special_value} label={`Special value for ${row.material.name}`} editable={editable} placeholder="e.g. Q.S."
                      onChange={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, special_value: v } : r)))} />
                  </td>
                  <td data-label="Label claim">
                    <FieldText value={row.label_claim} label={`Label claim for ${row.material.name}`} editable={editable} placeholder="e.g. 0.25 mL"
                      onChange={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, label_claim: v } : r)))} />
                  </td>
                  <td data-label="AR No.">
                    <FieldText value={row.ar_no} label={`AR No. for ${row.material.name}`} editable={editable} placeholder="AR No."
                      onChange={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, ar_no: v } : r)))} />
                  </td>
                  {editable && (
                    <td className="fm-c-action">
                      <button
                        type="button"
                        className="fm-remove"
                        aria-label={`Remove ${row.material.name}`}
                        onClick={() => removeRow(index, row)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// A text entry for one line. Read only when the revision is approved.
function FieldText({ value, label, editable, placeholder, onChange }) {
  if (!editable) return <span>{value || '—'}</span>
  return (
    <input
      className="field-input fm-text-input"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ApprovalPanel({ companyId, formulaId, revision, canApprove, onApproved }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const check = async () => {
    setLoading(true)
    setError('')
    try {
      setPreview(await getApprovalPreview(companyId, formulaId, revision.id))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const approve = async () => {
    setLoading(true)
    setError('')
    try {
      await approveRevision(companyId, formulaId, revision.id, revision.version)
      onApproved(`Revision ${revision.revision_number} approved.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const eligibility = preview?.eligibility
  const approval = approvalActionState(preview, canApprove)

  return (
    <div className="fm-approval">
      <div className="fm-actions">
        <Button variant="secondary" onClick={check} loading={loading} disabled={loading}>
          Check approval
        </Button>
        {approval.canApprove && (
          <Button onClick={approve} loading={loading} disabled={loading}>
            Approve revision {revision.revision_number}
          </Button>
        )}
      </div>
      <p className="field-muted fm-approval-note">Approval is a separate step. Saving never approves a revision.</p>
      {error && <p className="field-error">{error}</p>}
      {eligibility?.policy_message && <Alert type="error">{eligibility.policy_message}</Alert>}
      {eligibility && !eligibility.ready_to_attempt && (
        <ul className="fm-blockers">
          {eligibility.blocking_reasons.map((reason) => (
            <li key={reasonText(reason)}>{reasonText(reason)}</li>
          ))}
        </ul>
      )}
      {eligibility && !approval.canApprove && <p className="field-muted">{approval.reason}</p>}
    </div>
  )
}
