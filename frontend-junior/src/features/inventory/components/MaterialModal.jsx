import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import { getErrorMessage } from '../../../utils/errors'
import {
  createMaterial,
  updateMaterial,
  listUnits,
  listContainerTypes,
} from '../../store/storeService'

const WRITE_DENIED =
  'You do not have permission to manage the material catalog. Only administrators with can_manage_material_catalog may add or edit materials.'

function writeMessage(err) {
  return err?.response?.status === 403 ? WRITE_DENIED : getErrorMessage(err)
}

const DEMO_UNIT_CODES = new Set(['DEMOBTL', 'DEMOKG', 'DEMOMG', 'DEMOMKG'])

export default function MaterialModal({ mode = 'create', material = null, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [code, setCode] = useState(material?.code || '')
  const [name, setName] = useState(material?.name || '')
  const [kind, setKind] = useState(material?.kind || 'RAW_MATERIAL')
  const [unitId, setUnitId] = useState(material?.base_unit_id || '')
  const [defaultContainerTypeId, setDefaultContainerTypeId] = useState(material?.default_container_type_id || '')
  const [description, setDescription] = useState(material?.description || '')

  const [units, setUnits] = useState([])
  const [unitsError, setUnitsError] = useState('')
  const [containerTypes, setContainerTypes] = useState([])
  const [containerTypesError, setContainerTypesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    listUnits()
      .then((res) => {
        const filtered = (res || []).filter(
          (u) => !DEMO_UNIT_CODES.has(u.code) && !u.code?.startsWith('DEMO')
        )
        setUnits(filtered)
        if (material?.base_unit_code) {
          const match = filtered.find(
            (u) => u.code === material.base_unit_code || u.id === material.base_unit_id
          )
          if (match) setUnitId(String(match.id))
        }
      })
      .catch((err) => setUnitsError(getErrorMessage(err)))

    listContainerTypes()
      .then(setContainerTypes)
      .catch((err) => setContainerTypesError(getErrorMessage(err)))
  }, [material])

  const submit = async () => {
    if (busy) return
    const problems = {}
    if (!code.trim()) problems.code = 'Enter a material code.'
    if (!name.trim()) problems.name = 'Enter a material name.'
    if (!unitId) problems.base_unit_id = 'Choose the base unit.'
    setFieldErrors(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setError('')
    try {
      if (isEdit) {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unitId),
        }
        const originalContainerId = material.default_container_type_id ?? ''
        if (String(defaultContainerTypeId) !== String(originalContainerId)) {
          payload.default_container_type_id = defaultContainerTypeId === '' ? null : Number(defaultContainerTypeId)
        }
        await updateMaterial(material.id, payload)
        onSaved(`${code.trim()} saved.`)
      } else {
        const payload = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          base_unit_id: Number(unitId),
        }
        if (defaultContainerTypeId !== '') payload.default_container_type_id = Number(defaultContainerTypeId)
        await createMaterial(payload)
        onSaved(`Material ${code.trim()} created.`)
      }
    } catch (err) {
      setError(writeMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${material.code}` : 'Add Material'}
      onClose={busy ? () => {} : onClose}
      maxWidth="640px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? 'Save changes' : 'Create material'}
          </Button>
        </>
      }
    >
      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div className="inv-modal-form">
        {/* Row 1: Code + Type */}
        <div className="inv-modal-form-row">
          <div className="company-field">
            <label className="inv-modal-field-label">Material code</label>
            <input
              className="company-input"
              value={code}
              placeholder="e.g. RM-001"
              onChange={(e) => setCode(e.target.value)}
            />
            {fieldErrors.code && <p className="field-error">{fieldErrors.code}</p>}
          </div>

          <div className="company-field">
            <label className="inv-modal-field-label">Type</label>
            <select className="company-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="RAW_MATERIAL">Raw material</option>
              <option value="PACKAGING_MATERIAL">Packaging</option>
              <option value="MOTHER_TINCTURE">Mother Tincture</option>
            </select>
          </div>
        </div>

        {/* Row 2: Name (full width) */}
        <div className="company-field">
          <label className="inv-modal-field-label">Material name</label>
          <input
            className="company-input"
            value={name}
            placeholder="Full descriptive name"
            onChange={(e) => setName(e.target.value)}
          />
          {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
        </div>

        {/* Row 3: Base unit + Default container type */}
        <div className="inv-modal-form-row">
          <div className="company-field">
            <label className="inv-modal-field-label">Base unit</label>
            <select className="company-input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Choose a unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
              ))}
            </select>
            {unitsError && <p className="field-error">{unitsError}</p>}
            {fieldErrors.base_unit_id && <p className="field-error">{fieldErrors.base_unit_id}</p>}
          </div>

          <div className="company-field">
            <label className="inv-modal-field-label">Default container type <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optional)</span></label>
            <select className="company-input" value={defaultContainerTypeId} onChange={(e) => setDefaultContainerTypeId(e.target.value)}>
              <option value="">None</option>
              {containerTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
              ))}
            </select>
            {containerTypesError && <p className="field-error">{containerTypesError}</p>}
          </div>
        </div>

        {/* Row 4: Description (full width) */}
        <div className="company-field">
          <label className="inv-modal-field-label">Description <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optional)</span></label>
          <input
            className="company-input"
            value={description}
            placeholder="Brief description or notes"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

      </div>
    </Modal>
  )
}
