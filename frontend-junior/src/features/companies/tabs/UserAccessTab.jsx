import { useEffect, useMemo, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Spinner, { LoadingState } from '../../../components/Spinner'
import Modal from '../../inventory/components/Modal'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'
import usePermissions from '../../../hooks/usePermissions'
import useAuth from '../../../hooks/useAuth'

import {
  activateUser,
  assignUserMembership,
  assignUserRole,
  createUser,
  deactivateUser,
  deactivateUserMembership,
  deactivateUserRole,
  listCompanies,
  listCompanyRoles,
  listUserMemberships,
  listUserRoleAssignments,
  listUsers,
  setUserPassword,
  updateUser,
} from '../usersApiService'
import UserImportModal from './UserImportModal'
import './UserAccessForm.css'

const EMPTY_FORM = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  employee_id: '',
  joining_date: '',
  role_id: '',
  employment_status: 'active',
  department: '',
  designation: '',
  shift: '',
  company_id: '',
  common_inventory_access: false,
  both_companies_access: false,
}

const EMPLOYMENT_STATUS_OPTIONS = [
  ['active', 'Active'],
  ['probation', 'Probation'],
  ['notice', 'Notice period'],
  ['resigned', 'Resigned'],
  ['terminated', 'Terminated'],
]

function parseFieldErrors(error) {
  const data = error?.response?.data
  if (!data || typeof data !== 'object') return {}
  const map = {}
  for (const [field, value] of Object.entries(data)) {
    if (field === 'detail') continue
    map[field] = Array.isArray(value) ? value.join(' ') : String(value)
  }
  return map
}

const statusLabel = (value) => EMPLOYMENT_STATUS_OPTIONS.find(([key]) => key === value)?.[1] || value || '—'

function generateNextEmployeeId(userList = []) {
  let max = 0
  for (const u of userList) {
    if (!u.employee_id) continue
    const m = String(u.employee_id).match(/(\d+)/)
    if (m) {
      const val = parseInt(m[1], 10)
      if (!isNaN(val) && val > max) max = val
    }
  }
  const next = max > 0 ? max + 1 : (userList.length + 1)
  return `EMP-${String(next).padStart(3, '0')}`
}

// Company access for an existing user: memberships, their roles, and the
// controls to add or remove either. Every change is its own API call.
function CompanyAccessPanel({ userId, onError }) {
  const [memberships, setMemberships] = useState([])
  const [assignments, setAssignments] = useState({})
  const [companies, setCompanies] = useState([])
  const [rolesByCompany, setRolesByCompany] = useState({})
  const [newCompanyId, setNewCompanyId] = useState('')
  const [newCompanyRoleId, setNewCompanyRoleId] = useState('')
  const [newRoleIds, setNewRoleIds] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const loadRoles = async (companyId) => {
    const roles = await listCompanyRoles(companyId)
    setRolesByCompany((prev) => ({ ...prev, [companyId]: roles }))
    return roles
  }

  const load = async () => {
    setLoading(true)
    try {
      const [rows, companyRows] = await Promise.all([listUserMemberships(userId), listCompanies()])
      const active = rows.filter((m) => m.is_active)
      const assigned = {}
      await Promise.all(
        active.map(async (m) => {
          assigned[m.id] = (await listUserRoleAssignments(userId, m.id)).filter((a) => a.is_active)
        })
      )
      setMemberships(active)
      setAssignments(assigned)
      setCompanies(companyRows)
      await Promise.all(active.map((m) => loadRoles(m.company_id)))
    } catch (error) {
      onError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const run = async (action, successText) => {
    setBusy(true)
    setNotice('')
    onError('')
    try {
      await action()
      setNotice(successText)
      await load()
    } catch (error) {
      onError(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const available = companies.filter((c) => !memberships.some((m) => m.company_id === c.id))

  const pickNewCompany = (value) => {
    setNewCompanyId(value)
    setNewCompanyRoleId('')
    if (value) loadRoles(Number(value)).catch((error) => onError(getErrorMessage(error)))
  }

  const addCompany = () => {
    if (!newCompanyId) return
    const company = companies.find((c) => String(c.id) === String(newCompanyId))
    run(async () => {
      const membership = await assignUserMembership(userId, Number(newCompanyId))
      if (newCompanyRoleId) await assignUserRole(userId, membership.id, Number(newCompanyRoleId))
      setNewCompanyId('')
      setNewCompanyRoleId('')
    }, newCompanyRoleId ? `Assigned to ${company?.code || 'company'} with role.` : `Assigned to ${company?.code || 'company'}.`)
  }

  const removeCompany = async (membership) => {
    if (!(await confirmAction(`Remove access to ${membership.company_code}? Its roles will stop applying.`, { confirmLabel: 'Remove', danger: true, title: 'Remove company access' }))) return
    run(() => deactivateUserMembership(userId, membership.id), `Removed from ${membership.company_code}.`)
  }

  const addRole = (membership) => {
    const roleId = newRoleIds[membership.id]
    if (!roleId) return
    run(async () => {
      await assignUserRole(userId, membership.id, Number(roleId))
      setNewRoleIds((prev) => ({ ...prev, [membership.id]: '' }))
    }, `Role added in ${membership.company_code}.`)
  }

  const removeRole = async (membership, assignment) => {
    if (!(await confirmAction(`Remove role ${assignment.role_code} in ${membership.company_code}?`, { confirmLabel: 'Remove', danger: true, title: 'Remove role' }))) return
    run(() => deactivateUserRole(userId, membership.id, assignment.id), `Role removed in ${membership.company_code}.`)
  }

  if (loading) return <LoadingState label="Loading company access…" compact />

  return (
    <section className="uf-group" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <span className="uf-title">🏢 Company Access & Permission Roles</span>
          <p className="uf-help" style={{ marginTop: 2 }}>
            Manage user memberships across companies and assign authorized permission roles.
          </p>
        </div>
      </div>
      {notice && <Alert type="success">{notice}</Alert>}

      {memberships.length === 0 && (
        <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
          No company assigned yet. Select a company below to grant workspace access.
        </div>
      )}

      {memberships.map((membership) => {
        const roles = (rolesByCompany[membership.company_id] || []).filter((r) => r.is_active)
        const current = assignments[membership.id] || []
        const assignable = roles.filter((r) => !current.some((a) => a.role_id === r.id))

        return (
          <div key={membership.id} className="uf-company-card">
            {/* Header: Company Pill, Name & Remove Button */}
            <div className="uf-company-header">
              <div className="uf-company-identity">
                <span className="uf-company-pill">{membership.company_code}</span>
                <span className="uf-company-name">
                  {membership.company_display_name || membership.company_legal_name}
                </span>
              </div>
              <button
                type="button"
                className="uf-remove-comp-btn"
                onClick={() => removeCompany(membership)}
                disabled={busy}
                title={`Revoke access to ${membership.company_code}`}
              >
                ✕ Revoke Company Access
              </button>
            </div>

            {/* Body: Assigned Roles */}
            <div className="uf-roles-label">Assigned Roles ({current.length})</div>
            {current.length === 0 ? (
              <div className="uf-no-roles">
                ⚠️ No roles assigned in this company yet. The user has membership but cannot access role-gated features.
              </div>
            ) : (
              <div className="uf-roles-chip-wrap">
                {current.map((a) => (
                  <span key={a.id} className="uf-role-chip">
                    <span>🛡️ {a.role_name}</span>
                    <button
                      type="button"
                      className="uf-role-chip-x"
                      onClick={() => removeRole(membership, a)}
                      disabled={busy}
                      title={`Remove role ${a.role_name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Inline Add Role */}
            {assignable.length > 0 ? (
              <div className="uf-add-role-bar">
                <select
                  className="uf-add-role-select"
                  value={newRoleIds[membership.id] || ''}
                  onChange={(e) => setNewRoleIds((prev) => ({ ...prev, [membership.id]: e.target.value }))}
                  disabled={busy}
                >
                  <option value="">+ Select role to grant in {membership.company_code}…</option>
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="uf-add-role-btn"
                  onClick={() => addRole(membership)}
                  disabled={busy || !newRoleIds[membership.id]}
                >
                  + Add Role
                </button>
              </div>
            ) : roles.length > 0 ? (
              <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>
                ✓ All available roles in {membership.company_code} are already granted to this user.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                No active roles configured for this company yet.
              </div>
            )}
          </div>
        )
      })}

      {/* Grant Access to Another Company Card */}
      {available.length > 0 ? (
        <div className="uf-assign-new-card">
          <div className="uf-assign-new-title">
            <span>➕ Grant Access to Another Company</span>
          </div>
          <div className="uf-assign-grid">
            <div>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 4 }}>
                Select Company
              </label>
              <select
                className="field-input"
                style={{ height: 36 }}
                value={newCompanyId}
                onChange={(e) => pickNewCompany(e.target.value)}
                disabled={busy}
              >
                <option value="">-- Choose Company --</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.display_name || c.legal_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11, marginBottom: 4 }}>
                Initial Role (Optional)
              </label>
              <select
                className="field-input"
                style={{ height: 36 }}
                value={newCompanyRoleId}
                onChange={(e) => setNewCompanyRoleId(e.target.value)}
                disabled={busy || !newCompanyId}
              >
                <option value="">{newCompanyId ? '-- Select Initial Role (Optional) --' : 'Pick a company first'}</option>
                {(rolesByCompany[Number(newCompanyId)] || [])
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="uf-assign-btn"
            onClick={addCompany}
            disabled={busy || !newCompanyId}
          >
            + Grant Company Access
          </button>
        </div>
      ) : companies.length > 0 && memberships.length > 0 ? (
        <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginTop: 4 }}>
          ✓ User has access to all active companies in the organization.
        </div>
      ) : null}
    </section>
  )
}

// Users are real backend accounts (apps.users). The API is superuser-only, so
// a non-superuser sees the server's refusal rather than an empty list.
export default function UserAccessTab({ companyId: propCompanyId = null }) {
  // Scopes the list to the active company workspace's own members, so this
  // screen shows that company's employees, not every account on the whole
  // platform. (Creating or assigning a user to a DIFFERENT company is still
  // possible from the create/edit form below - this only scopes the list.)
  const { loading: permissionsLoading, realCompanyId } = usePermissions()
  const companyId = propCompanyId || realCompanyId || ''
  const { user } = useAuth()
  const activeCompanyName = user?.profile?.real_companies?.find((c) => c.id === realCompanyId)?.display_name
    || user?.profile?.real_companies?.find((c) => c.id === realCompanyId)?.legal_name
    || ''
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | { mode: 'create' } | { mode: 'edit', user }
  const [form, setForm] = useState(EMPTY_FORM)
  const [createRoles, setCreateRoles] = useState([])
  const [createCompanies, setCreateCompanies] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const requestRef = useRef(0)
  // Password-change panel (edit mode only)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ new_password: '', confirm_password: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState('')

  // Suggestions for the Department box come from departments already in use.
  const departmentSuggestions = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort(),
    [users]
  )

  const load = async (term) => {
    const id = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const rows = await listUsers({ search: (term ?? '').trim(), companyId: realCompanyId })
      if (requestRef.current !== id) return
      setUsers(rows)
    } catch (err) {
      if (requestRef.current !== id) return
      setError(getErrorMessage(err))
    } finally {
      if (requestRef.current === id) setLoading(false)
    }
  }

  useEffect(() => {
    // Wait for the real company id to resolve first - fetching before that
    // would briefly show every account on the platform, then narrow down,
    // which is exactly the flash this is avoiding.
    if (permissionsLoading) return
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, realCompanyId, permissionsLoading])

  useEffect(() => {
    if (!modal) return
    listCompanies().then(setCreateCompanies).catch(() => setCreateCompanies([]))
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const targetComp = form.company_id || companyId
    if (!targetComp) {
      setCreateRoles([])
      return
    }
    listCompanyRoles(targetComp)
      .then((roles) => setCreateRoles(roles.filter((r) => r.is_active)))
      .catch(() => setCreateRoles([]))
  }, [form.company_id, companyId])

  const openCreate = () => {
    const autoEmpId = generateNextEmployeeId(users)
    setForm({
      ...EMPTY_FORM,
      employee_id: autoEmpId,
      company_id: companyId ? String(companyId) : '',
    })
    setFieldErrors({})
    setError('')
    setNotice('')
    setPwOpen(false)
    setPwForm({ new_password: '', confirm_password: '' })
    setPwError('')
    setPwSuccess('')
    setModal({ mode: 'create' })
  }

  const openEdit = (user) => {
    setForm({
      ...EMPTY_FORM,
      username: user.username,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      employee_id: user.employee_id || '',
      joining_date: user.joining_date || '',
      employment_status: user.employment_status || 'active',
      department: user.department || '',
      designation: user.designation || '',
      shift: user.shift || '',
      common_inventory_access: Boolean(user.common_inventory_access),
      both_companies_access: false,
    })
    setFieldErrors({})
    setPwOpen(false)
    setPwForm({ new_password: '', confirm_password: '' })
    setPwError('')
    setPwSuccess('')
    setError('')
    setNotice('')
    setModal({ mode: 'edit', user })
  }

  const closeModal = () => {
    setModal(null)
    setFieldErrors({})
    setError('')
    setPwOpen(false)
  }

  const changePassword = async () => {
    if (pwSaving) return
    setPwError('')
    setPwSuccess('')
    if (!pwForm.new_password) { setPwError('New password is required.'); return }
    if (pwForm.new_password.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (pwForm.new_password !== pwForm.confirm_password) { setPwError('Passwords do not match.'); return }
    setPwSaving(true)
    try {
      await setUserPassword(modal.user.id, pwForm.new_password)
      setPwSuccess('Password updated successfully.')
      setPwForm({ new_password: '', confirm_password: '' })
    } catch (err) {
      const data = err?.response?.data
      const msg = data?.new_password
        ? (Array.isArray(data.new_password) ? data.new_password.join(' ') : data.new_password)
        : getErrorMessage(err)
      setPwError(msg)
    } finally {
      setPwSaving(false)
    }
  }

  const profilePayload = () => ({
    phone: form.phone.trim(),
    employee_id: form.employee_id.trim(),
    department: form.department.trim(),
    designation: form.designation.trim(),
    shift: form.shift ? form.shift.trim() : '',
    joining_date: form.joining_date || null,
    employment_status: form.employment_status,
    common_inventory_access: form.common_inventory_access,
  })

  const save = async () => {
    if (saving) return
    setSaving(true)
    setFieldErrors({})
    setError('')
    try {
      const activeCompId = Number(form.company_id || companyId)
      if (modal.mode === 'create') {
        const created = await createUser({
          username: form.username.trim(),
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          initial_password: form.password,
          ...profilePayload(),
        })
        let access = ''
        if (activeCompId) {
          const membership = await assignUserMembership(created.id, activeCompId)
          access = ' Active company assigned.'
          if (form.role_id) {
            await assignUserRole(created.id, membership.id, Number(form.role_id))
            access = ' Active company and role assigned.'
          }
          if (form.both_companies_access) {
            const others = createCompanies.filter((c) => c.id !== activeCompId)
            for (const other of others) {
              try {
                await assignUserMembership(created.id, other.id)
                access = ' Both companies access assigned.'
              } catch {
                // Ignore if duplicate
              }
            }
          }
        }
        setNotice(`User ${form.username.trim()} created.${access}`)
        closeModal()
      } else {
        await updateUser(modal.user.id, {
          username: form.username.trim(),
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          ...profilePayload(),
        })
        if (form.both_companies_access) {
          for (const c of createCompanies) {
            try {
              await assignUserMembership(modal.user.id, c.id)
            } catch {
              // Ignore if already member
            }
          }
        }
        setNotice(`User ${form.username.trim()} saved.`)
        closeModal()
      }
      load(search)
    } catch (err) {
      setFieldErrors(parseFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user) => {
    const verb = user.is_active ? 'Deactivate' : 'Activate'
    const detail = user.is_active
      ? 'They will not be able to sign in until reactivated.'
      : 'They will be able to sign in again.'
    if (!(await confirmAction(`${verb} ${user.username}? ${detail}`, { confirmLabel: verb, danger: user.is_active, title: `${verb} user` }))) return
    setError('')
    try {
      if (user.is_active) await deactivateUser(user.id)
      else await activateUser(user.id)
      setNotice(`User ${user.username} ${user.is_active ? 'deactivated' : 'activated'}.`)
      load(search)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const displayName = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username

  const fieldError = (name) => (fieldErrors[name] ? <span className="field-error">{fieldErrors[name]}</span> : null)

  return (
    <section className="company-panel user-management">
      <div className="company-toolbar" style={{ marginBottom: 14 }}>
        <div>
          <h2>User Management</h2>
          <p>
            Accounts that can sign in to this ERP, with their employee details and company access.
            {activeCompanyName && <> Showing <strong>{activeCompanyName}</strong>&rsquo;s own members.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="so-btn-import-csv" onClick={() => setImporting(true)}>
            📥 Import CSV
          </button>
          <Button type="button" onClick={openCreate}>
            + Add user
          </Button>
        </div>
      </div>

      {error && !modal && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Alert type="error">{error}</Alert>
          <button
            type="button"
            onClick={() => setError('')}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              color: '#991b1b',
              fontWeight: 'bold',
            }}
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {notice && <Alert type="success">{notice}</Alert>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 260, maxWidth: 360, flex: '1 1 260px' }}>
          <Input label="" name="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." />
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Showing <strong>{users.length}</strong> {users.length === 1 ? 'user' : 'users'}
        </div>
      </div>

      <div className="company-table-wrap">
        <table className="company-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Employee ID</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Shift</th>
              <th>Employment</th>
              <th>Status</th>
              <th className="company-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="11" className="company-empty" style={{ textAlign: 'center', padding: '30px' }}>
                  <Spinner tone="brand" label="Loading users..." />
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{displayName(user)}</strong>
                    {user.is_superuser && (
                      <span className="company-badge" style={{ marginLeft: 6, fontSize: 10, background: '#ede9fe', color: '#6d28d9', padding: '2px 6px', borderRadius: 4 }}>
                        Superuser
                      </span>
                    )}
                  </td>
                  <td>{user.username}</td>
                  <td>{user.email || '—'}</td>
                  <td>{user.phone || '—'}</td>
                  <td>{user.employee_id || '—'}</td>
                  <td>{user.department || '—'}</td>
                  <td>{user.designation || '—'}</td>
                  <td>{user.shift || '—'}</td>
                  <td>{statusLabel(user.employment_status)}</td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: user.is_active ? '#dcfce7' : '#fee2e2',
                        color: user.is_active ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="company-actions">
                    <button type="button" className="table-edit" onClick={() => openEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={user.is_active ? 'table-delete' : 'table-edit'}
                      onClick={() => toggleActive(user)}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && users.length === 0 && !error && (
              <tr>
                <td colSpan="10" className="company-empty" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Add User' : `Edit user · ${modal.user.username}`}
          subheader={modal.mode === 'create' ? <p className="uf-help">Create a new user for the active company.</p> : undefined}
          onClose={closeModal}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>
                {modal.mode === 'edit' ? 'Close' : 'Cancel'}
              </Button>
              <Button onClick={save} loading={saving} disabled={saving}>
                {modal.mode === 'create' ? 'Create user' : 'Save changes'}
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}
          <form id="user-form" className="uf-form" onSubmit={(event) => { event.preventDefault(); save() }}>
            <section className="uf-group">
              <span className="uf-title">Account details</span>
              <div className="inv-form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="uf-username">Username *</label>
                  <input id="uf-username" className="field-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                  {fieldError('username')}
                </div>
                {modal.mode === 'create' && (
                  <div className="field">
                    <label className="field-label" htmlFor="uf-password">Temporary Password *</label>
                    <input id="uf-password" className="field-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required placeholder="At least 8 characters" autoComplete="new-password" />
                    {fieldError('initial_password')}
                  </div>
                )}
                <div className="field">
                  <label className="field-label" htmlFor="uf-first">First Name *</label>
                  <input id="uf-first" className="field-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                  {fieldError('first_name')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-last">Last Name</label>
                  <input id="uf-last" className="field-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  {fieldError('last_name')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-email">Email *</label>
                  <input id="uf-email" className="field-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  {fieldError('email')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-phone">Phone</label>
                  <input id="uf-phone" className="field-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
                  {fieldError('phone')}
                </div>
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="field-label" htmlFor="uf-employee">Employee ID</label>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, employee_id: generateNextEmployeeId(users) }))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 600,
                      }}
                      title="Auto-generate next sequential Employee ID"
                    >
                      ⚡ Auto ID
                    </button>
                  </div>
                  <input
                    id="uf-employee"
                    className="field-input"
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    maxLength={50}
                    placeholder="e.g. EMP-007"
                  />
                  {fieldError('employee_id')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-joining">Joining Date</label>
                  <input id="uf-joining" className="field-input" type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
                  {fieldError('joining_date')}
                </div>
              </div>
            </section>

            <section className="uf-group">
              <span className="uf-title">Access & Work Profile</span>
              <div className="inv-form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="uf-role">Role</label>
                  {modal.mode === 'create' ? (
                    <select id="uf-role" className="field-input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                      <option value="">Select a role</option>
                      {createRoles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="uf-help">Set per company below under Company access and roles.</span>
                  )}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-shift">Shift</label>
                  <input
                    id="uf-shift"
                    className="field-input"
                    value={form.shift}
                    onChange={(e) => setForm({ ...form, shift: e.target.value })}
                    maxLength={50}
                    placeholder="e.g. Morning, General, Night"
                  />
                  {fieldError('shift')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-status">Employment Status</label>
                  <select id="uf-status" className="field-input" value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })}>
                    {EMPLOYMENT_STATUS_OPTIONS.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  {fieldError('employment_status')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-department">Department</label>
                  <input id="uf-department" className="field-input" list="uf-department-list" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={100} placeholder="Select or type department" />
                  <datalist id="uf-department-list">
                    {departmentSuggestions.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                  {fieldError('department')}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="uf-designation">Designation</label>
                  <input id="uf-designation" className="field-input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} maxLength={100} />
                  {fieldError('designation')}
                </div>
              </div>
            </section>

            <section className="uf-group">
              <span className="uf-title">Cross-Workspace & Inventory Access</span>
              <div className="uf-access-box">
                <label className="uf-check-item">
                  <input
                    type="checkbox"
                    className="uf-checkbox"
                    checked={form.common_inventory_access}
                    onChange={(e) => setForm({ ...form, common_inventory_access: e.target.checked })}
                  />
                  <div className="uf-check-text">
                    <span className="uf-check-label">Allow access to Common Inventory</span>
                    <span className="uf-check-desc">Grants user permission to view and transact within the shared pharmaceutical store.</span>
                  </div>
                </label>
                <label className="uf-check-item">
                  <input
                    type="checkbox"
                    className="uf-checkbox"
                    checked={form.both_companies_access}
                    onChange={(e) => setForm({ ...form, both_companies_access: e.target.checked })}
                  />
                  <div className="uf-check-text">
                    <span className="uf-check-label">Allow access to Both Companies</span>
                    <span className="uf-check-desc">Grants user membership in both CMHP Pharma and Tej Biocare.</span>
                  </div>
                </label>
              </div>
            </section>
          </form>

          {modal.mode === 'edit' && (
            <section className="uf-group" style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setPwOpen((v) => !v); setPwError(''); setPwSuccess(''); setPwForm({ new_password: '', confirm_password: '' }) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '6px 0', fontSize: 13, fontWeight: 600, color: '#0f172a',
                }}
              >
                <span style={{ fontSize: 16 }}>🔑</span>
                Change Password
                <span style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }}>{pwOpen ? '▲' : '▼'}</span>
              </button>

              {pwOpen && (
                <div style={{ marginTop: 10, padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  {pwError && <Alert type="error" style={{ marginBottom: 10 }}>{pwError}</Alert>}
                  {pwSuccess && <Alert type="success" style={{ marginBottom: 10 }}>{pwSuccess}</Alert>}
                  <div className="inv-form-grid" style={{ marginBottom: 12 }}>
                    <div className="field">
                      <label className="field-label" htmlFor="pw-new">New Password *</label>
                      <input
                        id="pw-new"
                        className="field-input"
                        type="password"
                        value={pwForm.new_password}
                        onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        disabled={pwSaving}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor="pw-confirm">Confirm New Password *</label>
                      <input
                        id="pw-confirm"
                        className="field-input"
                        type="password"
                        value={pwForm.confirm_password}
                        onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                        disabled={pwSaving}
                      />
                    </div>
                  </div>
                  <Button onClick={changePassword} loading={pwSaving} disabled={pwSaving}>
                    🔑 Set New Password
                  </Button>
                </div>
              )}
            </section>
          )}

          {modal.mode === 'edit' && <CompanyAccessPanel userId={modal.user.id} onError={setError} />}
        </Modal>
      )}

      {importing && (
        <UserImportModal
          onClose={() => setImporting(false)}
          defaultCompanyId={realCompanyId || null}
          onImported={() => {
            setNotice('User import finished. See the results in the import window.')
            load(search)
          }}
        />
      )}
    </section>
  )
}
