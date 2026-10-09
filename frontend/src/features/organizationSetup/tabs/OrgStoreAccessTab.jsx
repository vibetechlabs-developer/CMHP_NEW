import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import { LoadingState } from '../../../components/Spinner'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import RolePermissionEditor from '../RolePermissionEditor'
import {
  activateStoreRole,
  assignStoreMembership,
  assignStoreRole,
  createStoreRole,
  deactivateStoreMembership,
  deactivateStoreRole,
  deactivateStoreRoleAssignment,
  listAllPermissions,
  listStoreMemberships,
  listStoreRoleAssignments,
  listStoreRolesAdmin,
  listStoresAdmin,
  listUsers,
  replaceStoreRolePermissions,
} from '../organizationSetupService'

const EMPTY_ROLE_FORM = { code: '', name: '', description: '' }

// Mirrors OrgCompanyAccessTab.jsx exactly, scoped to STORE instead of
// COMPANY - no store-membership/role-assignment screen existed anywhere in
// the frontend before this (unlike company access, which User Management
// already covers for an existing user), so the membership panel here is
// new, not a reuse of something else.
export default function OrgStoreAccessTab() {
  const [stores, setStores] = useState([])
  const [storeId, setStoreId] = useState('')
  const [storesError, setStoresError] = useState('')

  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [allPermissions, setAllPermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsError, setPermissionsError] = useState('')
  const [savingPermissions, setSavingPermissions] = useState(false)

  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM)
  const [roleFieldErrors, setRoleFieldErrors] = useState({})
  const [creatingRole, setCreatingRole] = useState(false)
  const [notice, setNotice] = useState('')

  const requestRef = useRef(0)

  useEffect(() => {
    listStoresAdmin({ pageSize: 100 })
      .then((result) => setStores(result.results))
      .catch((err) => setStoresError(getErrorMessage(err)))
  }, [])

  const loadRoles = async (id) => {
    const reqId = ++requestRef.current
    setRolesLoading(true)
    setRolesError('')
    try {
      const rows = await listStoreRolesAdmin(id)
      if (requestRef.current !== reqId) return
      setRoles(rows)
    } catch (err) {
      if (requestRef.current !== reqId) return
      setRolesError(getErrorMessage(err))
    } finally {
      if (requestRef.current === reqId) setRolesLoading(false)
    }
  }

  useEffect(() => {
    setSelectedRoleId(null)
    if (!storeId) {
      setRoles([])
      return
    }
    loadRoles(storeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    setPermissionsError('')
    if (!storeId) return
    setPermissionsLoading(true)
    listAllPermissions('STORE')
      .then(setAllPermissions)
      .catch((err) => setPermissionsError(getErrorMessage(err)))
      .finally(() => setPermissionsLoading(false))
  }, [storeId])

  const createRole = async () => {
    if (creatingRole) return
    setCreatingRole(true)
    setRoleFieldErrors({})
    try {
      await createStoreRole(storeId, {
        code: roleForm.code.trim(),
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
      })
      setNotice(`Role ${roleForm.code.trim()} created with no permissions yet.`)
      setRoleForm(EMPTY_ROLE_FORM)
      loadRoles(storeId)
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') setRoleFieldErrors(data)
    } finally {
      setCreatingRole(false)
    }
  }

  const toggleRoleActive = async (role) => {
    const verb = role.is_active ? 'Deactivate' : 'Activate'
    if (!(await confirmAction(`${verb} role ${role.code}? Every member holding only this role loses its permissions immediately.`, { confirmLabel: verb, danger: role.is_active, title: `${verb} role` })))
      return
    try {
      if (role.is_active) await deactivateStoreRole(storeId, role.id)
      else await activateStoreRole(storeId, role.id)
      setNotice(`${role.code} ${role.is_active ? 'deactivated' : 'activated'}.`)
      loadRoles(storeId)
    } catch (err) {
      setRolesError(getErrorMessage(err))
    }
  }

  const savePermissions = async (codes) => {
    setSavingPermissions(true)
    try {
      await replaceStoreRolePermissions(storeId, selectedRoleId, codes)
      setNotice('Permissions saved for this role.')
      loadRoles(storeId)
    } finally {
      setSavingPermissions(false)
    }
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId)
  const selectedStore = stores.find((s) => String(s.id) === String(storeId))

  return (
    <div className="org-tab">
      <div className="org-tab-head">
        <div>
          <h3>Store roles and memberships</h3>
          <p className="field-muted">Select a shared store to manage its roles, their permissions, and who has access.</p>
        </div>
      </div>

      {storesError && <Alert type="error">{storesError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="field">
        <label className="field-label" htmlFor="org-sa-store">Store</label>
        <select id="org-sa-store" className="field-input" value={storeId} onChange={(e) => { setStoreId(e.target.value); setNotice('') }}>
          <option value="">Select a store…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.code} · {s.name}{s.is_active ? '' : ' (inactive)'}</option>
          ))}
        </select>
      </div>

      {storeId && (
        <>
          <section className="org-section">
            <h4>Roles in {selectedStore?.code}</h4>
            {rolesError && <Alert type="error">{rolesError} <button type="button" className="table-edit" onClick={() => loadRoles(storeId)}>Retry</button></Alert>}
            {rolesLoading ? (
              <LoadingState label="Loading roles…" compact />
            ) : (
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead><tr><th>Code</th><th>Name</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {roles.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16 }}>No roles yet for this store.</td></tr>}
                    {roles.map((r) => (
                      <tr key={r.id} className={selectedRoleId === r.id ? 'is-selected' : ''}>
                        <td className="cell-strong">{r.code}</td>
                        <td>{r.name}</td>
                        <td>{r.permissions.length}</td>
                        <td>{r.is_active ? 'Active' : 'Inactive'}</td>
                        <td>
                          <button type="button" className="table-edit" onClick={() => setSelectedRoleId(r.id)}>Edit permissions</button>
                          <button type="button" className="table-edit" style={{ marginLeft: 12 }} onClick={() => toggleRoleActive(r)}>
                            {r.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="org-inline-form">
              <div className="field">
                <label className="field-label" htmlFor="org-srole-code">New role code *</label>
                <input id="org-srole-code" className="field-input" value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} />
                {roleFieldErrors.code && <span className="field-error">{roleFieldErrors.code}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-srole-name">Name *</label>
                <input id="org-srole-name" className="field-input" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
                {roleFieldErrors.name && <span className="field-error">{roleFieldErrors.name}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-srole-desc">Description</label>
                <input id="org-srole-desc" className="field-input" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
              </div>
              <Button variant="secondary" onClick={createRole} disabled={creatingRole || !roleForm.code.trim() || !roleForm.name.trim()} loading={creatingRole}>
                + Add role
              </Button>
            </div>

            {selectedRole && (
              <div className="org-permission-panel">
                <h4>Permissions for {selectedRole.code}</h4>
                {permissionsError && <Alert type="error">{permissionsError}</Alert>}
                {permissionsLoading ? (
                  <LoadingState label="Loading permission catalog…" compact />
                ) : (
                  <RolePermissionEditor role={selectedRole} allPermissions={allPermissions} onSave={savePermissions} busy={savingPermissions} />
                )}
              </div>
            )}
          </section>

          <section className="org-section">
            <StoreMembershipPanel storeId={Number(storeId)} storeLabel={selectedStore?.code} roles={roles.filter((r) => r.is_active)} onNotice={setNotice} />
          </section>
        </>
      )}
    </div>
  )
}

function StoreMembershipPanel({ storeId, storeLabel, roles, onNotice }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [memberships, setMemberships] = useState([])
  const [assignments, setAssignments] = useState({})
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newRoleIds, setNewRoleIds] = useState({})

  const loadMembers = async () => {
    setLoadingMembers(true)
    setError('')
    try {
      const rows = (await listStoreMemberships(storeId)).filter((m) => m.is_active)
      setMemberships(rows)
      const assigned = {}
      await Promise.all(
        rows.map(async (m) => {
          assigned[m.id] = (await listStoreRoleAssignments(storeId, m.id)).filter((a) => a.is_active)
        })
      )
      setAssignments(assigned)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingMembers(false)
    }
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      listUsers({ search: search.trim() })
        .then((rows) => setResults(rows.filter((u) => !memberships.some((m) => m.user_id === u.id))))
        .catch((err) => setError(getErrorMessage(err)))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const assign = async (targetUser) => {
    setBusy(true)
    setError('')
    try {
      await assignStoreMembership(storeId, targetUser.id)
      onNotice(`${targetUser.username} assigned to ${storeLabel}.`)
      setSearch('')
      setResults([])
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (membership) => {
    if (!(await confirmAction(`Remove ${membership.username} from ${storeLabel}?`, { confirmLabel: 'Remove', danger: true, title: 'Remove store access' })))
      return
    setBusy(true)
    setError('')
    try {
      await deactivateStoreMembership(storeId, membership.id)
      onNotice(`${membership.username} removed from ${storeLabel}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addRole = async (membership) => {
    const roleId = newRoleIds[membership.id]
    if (!roleId) return
    setBusy(true)
    setError('')
    try {
      await assignStoreRole(storeId, membership.id, Number(roleId))
      setNewRoleIds((prev) => ({ ...prev, [membership.id]: '' }))
      onNotice(`Role assigned to ${membership.username}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const removeRole = async (membership, assignment) => {
    if (!(await confirmAction(`Remove role ${assignment.role_code} from ${membership.username}?`, { confirmLabel: 'Remove', danger: true, title: 'Remove role' })))
      return
    setBusy(true)
    setError('')
    try {
      await deactivateStoreRoleAssignment(storeId, membership.id, assignment.id)
      onNotice(`Role removed from ${membership.username}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h4>Members of {storeLabel}</h4>
      {error && <Alert type="error">{error}</Alert>}
      {loadingMembers ? (
        <LoadingState label="Loading members…" compact />
      ) : (
        <>
          {memberships.length === 0 && <p className="field-muted">No one has access to this store yet.</p>}
          {memberships.map((membership) => {
            const current = assignments[membership.id] || []
            const assignable = roles.filter((r) => !current.some((a) => a.role_id === r.id))
            return (
              <div key={membership.id} className="field org-member-row">
                <div className="inv-form-grid">
                  <div className="field">
                    <span className="field-label">{membership.username}</span>
                    <div>
                      {current.length === 0 && <span className="field-muted">No role yet</span>}
                      {current.map((a) => (
                        <span key={a.id} className="org-role-badge">
                          {a.role_name}{' '}
                          <button type="button" className="table-edit" onClick={() => removeRole(membership, a)} disabled={busy}>Remove</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="field-label">Add role</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select className="field-input" value={newRoleIds[membership.id] || ''} onChange={(e) => setNewRoleIds((prev) => ({ ...prev, [membership.id]: e.target.value }))} disabled={busy}>
                        <option value="">Select role</option>
                        {assignable.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                      </select>
                      <Button variant="secondary" onClick={() => addRole(membership)} disabled={busy || !newRoleIds[membership.id]}>Add</Button>
                    </div>
                  </div>
                </div>
                <button type="button" className="table-edit" onClick={() => remove(membership)} disabled={busy}>Remove from store</button>
              </div>
            )
          })}
        </>
      )}

      <div className="field">
        <label className="field-label" htmlFor="org-store-member-search">Assign an existing user</label>
        <input id="org-store-member-search" className="field-input" placeholder="Search by username, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {searching && <span className="field-muted">Searching…</span>}
        {results.length > 0 && (
          <ul className="org-search-results">
            {results.map((u) => (
              <li key={u.id}>
                <span>{u.username} {u.first_name ? `(${u.first_name} ${u.last_name})` : ''}</span>
                <Button variant="secondary" onClick={() => assign(u)} disabled={busy}>Assign</Button>
              </li>
            ))}
          </ul>
        )}
        {search.trim() && !searching && results.length === 0 && <span className="field-muted">No matching user found.</span>}
      </div>
    </div>
  )
}
