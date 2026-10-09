import { useEffect, useMemo, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'

// Full-replace permission editor for one CompanyRole or StoreRole. The
// backend endpoint (PUT .../roles/<id>/permissions/) always replaces the
// ENTIRE permission set with exactly what is sent - there is no add/remove-
// one-code endpoint. So the starting selection here is always the role's
// own current codes (preserving everything the admin has not intentionally
// unchecked), and `allPermissions` must already be every page of the
// catalog for this scope - never just the first page - so a permission on
// page 2+ is never silently dropped just because it was never shown.
export default function RolePermissionEditor({ role, allPermissions, onSave, busy }) {
  const currentCodes = useMemo(
    () => new Set((role.permissions || []).map((p) => p.code)),
    [role.id] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [selected, setSelected] = useState(currentCodes)
  const [error, setError] = useState('')

  // Reset the working selection whenever a different role is opened -
  // never carry one role's edits into another role's checkboxes.
  useEffect(() => {
    setSelected(new Set(currentCodes))
    setError('')
  }, [role.id, currentCodes])

  const inactiveAssigned = (role.permissions || []).filter(
    (p) => !p.is_active && !allPermissions.some((def) => def.code === p.code)
  )

  const byModule = useMemo(() => {
    const groups = {}
    for (const def of allPermissions) {
      if (!groups[def.module]) groups[def.module] = []
      groups[def.module].push(def)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [allPermissions])

  const toggle = (code) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const dirty = selected.size !== currentCodes.size || [...selected].some((code) => !currentCodes.has(code))

  const save = async () => {
    setError('')
    try {
      await onSave([...selected].sort())
    } catch (err) {
      setError(err?.response?.data?.permission_codes || 'Could not save this role’s permissions.')
    }
  }

  return (
    <div className="org-permission-editor">
      {error && <Alert type="error">{String(error)}</Alert>}
      {inactiveAssigned.length > 0 && (
        <Alert type="error">
          This role still has {inactiveAssigned.length} deactivated permission{inactiveAssigned.length === 1 ? '' : 's'} assigned
          ({inactiveAssigned.map((p) => p.code).join(', ')}). They are not shown as selectable below; saving will remove
          them from this role.
        </Alert>
      )}
      {byModule.length === 0 && <p className="field-muted">No permissions are defined for this scope yet.</p>}
      {byModule.map(([module, defs]) => (
        <fieldset key={module} className="org-permission-group">
          <legend>{module}</legend>
          {defs.map((def) => (
            <label key={def.code} className="org-permission-check" title={def.description}>
              <input type="checkbox" checked={selected.has(def.code)} onChange={() => toggle(def.code)} disabled={busy} />
              <span>
                {def.name} <code>{def.code}</code>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="org-permission-actions">
        <Button onClick={save} disabled={!dirty || busy} loading={busy}>
          Save permissions
        </Button>
        {dirty && <span className="field-muted">Unsaved selection changes.</span>}
      </div>
    </div>
  )
}
