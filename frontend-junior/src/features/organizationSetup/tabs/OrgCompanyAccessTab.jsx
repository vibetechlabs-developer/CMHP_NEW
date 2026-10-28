import { useEffect, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import { LoadingState } from '../../../components/Spinner'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import useAuth from '../../../hooks/useAuth'
import { refreshRealCompanyBridge } from '../../auth/authService'
import RolePermissionEditor from '../RolePermissionEditor'
import {
  activateCompanyRole,
  assignUserMembership,
  assignUserRole,
  createCompanyRole,
  deactivateCompanyRole,
  deactivateUserMembership,
  deactivateUserRole,
  listAllPermissions,
  listCompaniesAdmin,
  listCompanyRolesAdmin,
  listUserMemberships,
  listUserRoleAssignments,
  listUsers,
  replaceCompanyRolePermissions,
} from '../organizationSetupService'

const EMPTY_ROLE_FORM = { code: '', name: '', description: '' }

// Roles: create, activate/deactivate, and edit a role's permission set, for
// one selected company. Membership + role-assignment for a specific
// EXISTING user already has a full, real, tested screen in User Management
// (features/companies/tabs/UserAccessTab.jsx) - this reuses the identical
// underlying API functions (see organizationSetupService.js's re-exports)
// rather than rebuilding that logic, but surfaces it here too because
// setting up a brand-new company's first access grants, before anyone has
// gone looking at the Users screen yet, is exactly this screen's purpose.
export default function OrgCompanyAccessTab() {
  const { user, token, updateCurrentUser } = useAuth()
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [companiesError, setCompaniesError] = useState('')

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
    listCompaniesAdmin({ pageSize: 100 })
      .then((result) => setCompanies(result.results))
      .catch((err) => setCompaniesError(getErrorMessage(err)))
  }, [])

  const loadRoles = async (id) => {
    const reqId = ++requestRef.current
    setRolesLoading(true)
    setRolesError('')
    try {
      const rows = await listCompanyRolesAdmin(id)
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
    if (!companyId) {
      setRoles([])
      return
    }
    loadRoles(companyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    setPermissionsError('')
    if (!companyId) return
    setPermissionsLoading(true)
    listAllPermissions('COMPANY')
      .then(setAllPermissions)
      .catch((err) => setPermissionsError(getErrorMessage(err)))
      .finally(() => setPermissionsLoading(false))
  }, [companyId])

  const createRole = async () => {
    if (creatingRole) return
    setCreatingRole(true)
    setRoleFieldErrors({})
    try {
      await createCompanyRole(companyId, {
        code: roleForm.code.trim(),
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
      })
      setNotice(`Role ${roleForm.code.trim()} created with no permissions yet.`)
      setRoleForm(EMPTY_ROLE_FORM)
      loadRoles(companyId)
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
      if (role.is_active) await deactivateCompanyRole(companyId, role.id)
      else await activateCompanyRole(companyId, role.id)
      setNotice(`${role.code} ${role.is_active ? 'deactivated' : 'activated'}.`)
      loadRoles(companyId)
    } catch (err) {
      setRolesError(getErrorMessage(err))
    }
  }

  const savePermissions = async (codes) => {
    setSavingPermissions(true)
    try {
      await replaceCompanyRolePermissions(companyId, selectedRoleId, codes)
      setNotice('Permissions saved for this role.')
      loadRoles(companyId)
    } finally {
      setSavingPermissions(false)
    }
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId)
  const selectedCompany = companies.find((c) => String(c.id) === String(companyId))

  return (
    <div className="org-tab">
      <div className="org-tab-head">
        <div>
          <h3>Company roles and memberships</h3>
          <p className="field-muted">Select a company to manage its roles, their permissions, and who has access.</p>
        </div>
      </div>

      {companiesError && <Alert type="error">{companiesError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="field">
        <label className="field-label" htmlFor="org-ca-company">Company</label>
        <select id="org-ca-company" className="field-input" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setNotice('') }}>
          <option value="">Select a company…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.code} · {c.display_name || c.legal_name}{c.is_active ? '' : ' (inactive)'}</option>
          ))}
        </select>
      </div>

      {companyId && (
        <>
          <section className="org-section">
            <h4>Roles in {selectedCompany?.code}</h4>
            {rolesError && <Alert type="error">{rolesError} <button type="button" className="table-edit" onClick={() => loadRoles(companyId)}>Retry</button></Alert>}
            {rolesLoading ? (
              <LoadingState label="Loading roles…" compact />
            ) : (
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead><tr><th>Code</th><th>Name</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {roles.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16 }}>No roles yet for this company.</td></tr>}
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
                <label className="field-label" htmlFor="org-role-code">New role code *</label>
                <input id="org-role-code" className="field-input" value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} />
                {roleFieldErrors.code && <span className="field-error">{roleFieldErrors.code}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-role-name">Name *</label>
                <input id="org-role-name" className="field-input" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
                {roleFieldErrors.name && <span className="field-error">{roleFieldErrors.name}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-role-desc">Description</label>
                <input id="org-role-desc" className="field-input" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
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
            <CompanyMembershipPanel
              companyId={Number(companyId)}
              companyLabel={selectedCompany?.code}
              roles={roles.filter((r) => r.is_active)}
              currentUser={user}
              token={token}
              updateCurrentUser={updateCurrentUser}
              onNotice={setNotice}
            />
          </section>
        </>
      )}
    </div>
  )
}

// Membership assignment for one company: search an existing user, assign
// them, then assign/remove roles. Does not create users - that already
// exists in User Management (features/companies/tabs/UserAccessTab.jsx).
function CompanyMembershipPanel({ companyId, companyLabel, roles, currentUser, token, updateCurrentUser, onNotice }) {
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
      const users = await listUsers({ companyId })
      const withMemberships = await Promise.all(
        users.map(async (u) => {
          const rows = await listUserMemberships(u.id)
          const membership = rows.find((m) => m.company_id === companyId && m.is_active)
          return membership ? { user: u, membership } : null
        })
      )
      const active = withMemberships.filter(Boolean)
      setMemberships(active)
      const assigned = {}
      await Promise.all(
        active.map(async ({ user: memberUser, membership }) => {
          assigned[membership.id] = (await listUserRoleAssignments(memberUser.id, membership.id)).filter((a) => a.is_active)
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
  }, [companyId])

  useEffect(() => {
    if (!search.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      listUsers({ search: search.trim() })
        .then((rows) => setResults(rows.filter((u) => !memberships.some((m) => m.user.id === u.id))))
        .catch((err) => setError(getErrorMessage(err)))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const refreshOwnWorkspaceIfSelf = async (userId) => {
    if (!currentUser || userId !== currentUser.id || !token) return
    try {
      const bridge = await refreshRealCompanyBridge(token)
      if (bridge) {
        updateCurrentUser({
          ...currentUser,
          profile: {
            ...currentUser.profile,
            companies: bridge.companies,
            real_companies: bridge.realCompanies,
            primary_company: bridge.companies[0] ?? currentUser.profile.primary_company,
          },
        })
      }
    } catch {
      // A failed refresh never blocks the action that triggered it - the
      // change is already saved on the server; the acting admin's own
      // session will pick it up on next login if this refresh fails.
    }
  }

  const assign = async (targetUser) => {
    setBusy(true)
    setError('')
    try {
      await assignUserMembership(targetUser.id, companyId)
      await refreshOwnWorkspaceIfSelf(targetUser.id)
      onNotice(`${targetUser.username} assigned to ${companyLabel}.`)
      setSearch('')
      setResults([])
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async ({ user: targetUser, membership }) => {
    if (!(await confirmAction(`Remove ${targetUser.username} from ${companyLabel}?`, { confirmLabel: 'Remove', danger: true, title: 'Remove company access' })))
      return
    setBusy(true)
    setError('')
    try {
      await deactivateUserMembership(targetUser.id, membership.id)
      await refreshOwnWorkspaceIfSelf(targetUser.id)
      onNotice(`${targetUser.username} removed from ${companyLabel}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addRole = async ({ user: targetUser, membership }) => {
    const roleId = newRoleIds[membership.id]
    if (!roleId) return
    setBusy(true)
    setError('')
    try {
      await assignUserRole(targetUser.id, membership.id, Number(roleId))
      setNewRoleIds((prev) => ({ ...prev, [membership.id]: '' }))
      onNotice(`Role assigned to ${targetUser.username}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const removeRole = async ({ user: targetUser, membership }, assignment) => {
    if (!(await confirmAction(`Remove role ${assignment.role_code} from ${targetUser.username}?`, { confirmLabel: 'Remove', danger: true, title: 'Remove role' })))
      return
    setBusy(true)
    setError('')
    try {
      await deactivateUserRole(targetUser.id, membership.id, assignment.id)
      onNotice(`Role removed from ${targetUser.username}.`)
      loadMembers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h4>Members of {companyLabel}</h4>
      {error && <Alert type="error">{error}</Alert>}
      {loadingMembers ? (
        <LoadingState label="Loading members…" compact />
      ) : (
        <>
          {memberships.length === 0 && <p className="field-muted">No one has access to this company yet.</p>}
          {memberships.map(({ user: targetUser, membership }) => {
            const current = assignments[membership.id] || []
            const assignable = roles.filter((r) => !current.some((a) => a.role_id === r.id))
            return (
              <div key={membership.id} className="field org-member-row">
                <div className="inv-form-grid">
                  <div className="field">
                    <span className="field-label">{targetUser.username}</span>
                    <div>
                      {current.length === 0 && <span className="field-muted">No role yet</span>}
                      {current.map((a) => (
                        <span key={a.id} className="org-role-badge">
                          {a.role_name}{' '}
                          <button type="button" className="table-edit" onClick={() => removeRole({ user: targetUser, membership }, a)} disabled={busy}>Remove</button>
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
                      <Button variant="secondary" onClick={() => addRole({ user: targetUser, membership })} disabled={busy || !newRoleIds[membership.id]}>Add</Button>
                    </div>
                  </div>
                </div>
                <button type="button" className="table-delete" onClick={() => remove({ user: targetUser, membership })} disabled={busy}>Remove from company</button>
              </div>
            )
          })}
        </>
      )}

      <div className="field">
        <label className="field-label" htmlFor="org-member-search">Assign an existing user</label>
        <input id="org-member-search" className="field-input" placeholder="Search by username, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
