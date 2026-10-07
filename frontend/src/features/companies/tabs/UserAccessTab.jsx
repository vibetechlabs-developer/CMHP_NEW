import { useEffect, useMemo, useRef, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Modal from '../../inventory/components/Modal'
import { confirmAction } from '../../../components/ConfirmProvider'
import { getErrorMessage } from '../../../utils/errors'

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
  company_id: '',
  common_inventory_access: false,
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

  if (loading) return <p className="uf-help">Loading company access…</p>

  return (
    <section className="uf-group">
      <span className="uf-title">Company access and roles</span>
      <p className="uf-help">Access is granted per company. Roles decide what the user can do inside that company.</p>
      {notice && <Alert type="success">{notice}</Alert>}

      {memberships.length === 0 && <p className="uf-help">No company assigned yet.</p>}
      {memberships.map((membership) => {
        const roles = (rolesByCompany[membership.company_id] || []).filter((r) => r.is_active)
        const current = assignments[membership.id] || []
        const assignable = roles.filter((r) => !current.some((a) => a.role_id === r.id))
        return (
          <div key={membership.id} className="field">
            <div className="inv-form-grid">
              <div className="field">
                <span className="field-label">{membership.company_code} · {membership.company_display_name || membership.company_legal_name}</span>
                <div>
                  {current.length === 0 && <span className="uf-help">No role yet</span>}
                  {current.map((a) => (
                    <span key={a.id} className="company-badge">
                      {a.role_name}{' '}
                      <button type="button" className="company-link danger" onClick={() => removeRole(membership, a)} disabled={busy}>
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field-label">Add role</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="field-input"
                    value={newRoleIds[membership.id] || ''}
                    onChange={(e) => setNewRoleIds((prev) => ({ ...prev, [membership.id]: e.target.value }))}
                    disabled={busy}
                  >
                    <option value="">Select role</option>
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={() => addRole(membership)} disabled={busy || !newRoleIds[membership.id]}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <button type="button" className="company-link danger" onClick={() => removeCompany(membership)} disabled={busy}>
                Remove company access
              </button>
            </div>
          </div>
        )
      })}

      <div className="inv-form-grid">
        <div className="field">
          <span className="field-label">Assign to company</span>
          <select className="field-input" value={newCompanyId} onChange={(e) => pickNewCompany(e.target.value)} disabled={busy}>
            <option value="">Select company</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.display_name || c.legal_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">Role</span>
          <select
            className="field-input"
            value={newCompanyRoleId}
            onChange={(e) => setNewCompanyRoleId(e.target.value)}
            disabled={busy || !newCompanyId}
          >
            <option value="">{newCompanyId ? 'No role yet' : 'Pick a company first'}</option>
            {(rolesByCompany[Number(newCompanyId)] || []).filter((r) => r.is_active).map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Button variant="secondary" onClick={addCompany} disabled={busy || !newCompanyId}>
          Assign company
        </Button>
      </div>
    </section>
  )
}

// Users are real backend accounts (apps.users). The API is superuser-only, so
// a non-superuser sees the server's refusal rather than an empty list.
export default function UserAccessTab() {
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
      const rows = await listUsers({ search: (term ?? '').trim() })
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
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    if (modal?.mode !== 'create') return
    listCompanies().then(setCreateCompanies).catch(() => setCreateCompanies([]))
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.company_id) {
      setCreateRoles([])
      return
    }
    listCompanyRoles(form.company_id)
      .then((roles) => setCreateRoles(roles.filter((r) => r.is_active)))
      .catch(() => setCreateRoles([]))
  }, [form.company_id])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setError('')
    setNotice('')
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
      common_inventory_access: Boolean(user.common_inventory_access),
    })
    setFieldErrors({})
    setError('')
    setNotice('')
    setModal({ mode: 'edit', user })
  }

  const closeModal = () => {
    setModal(null)
    setFieldErrors({})
  }

  const profilePayload = () => ({
    phone: form.phone.trim(),
    employee_id: form.employee_id.trim(),
    department: form.department.trim(),
    designation: form.designation.trim(),
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
        if (form.company_id) {
          const membership = await assignUserMembership(created.id, Number(form.company_id))
          access = ' Company assigned.'
          if (form.role_id) {
            await assignUserRole(created.id, membership.id, Number(form.role_id))
            access = ' Company and role assigned.'
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
    <div className="company-tab">
      <div className="company-tab-header">
        <div>
          <h2>User Management</h2>
          <p>Accounts that can sign in to this ERP, with their employee details and company access.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setImporting(true)}>
            Import CSV
          </Button>
          <Button type="button" onClick={openCreate}>
            + Add user
          </Button>
        </div>
      </div>

      {error && !modal && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="company-toolbar">
        <Input label="" name="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." />
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
              <th>Employment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="10" className="company-empty">Loading users...</td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{displayName(user)}</strong>
                    {user.is_superuser && <span className="company-badge"> Superuser</span>}
                  </td>
                  <td>{user.username}</td>
                  <td>{user.email || '—'}</td>
                  <td>{user.phone || '—'}</td>
                  <td>{user.employee_id || '—'}</td>
                  <td>{user.department || '—'}</td>
                  <td>{user.designation || '—'}</td>
                  <td>{statusLabel(user.employment_status)}</td>
                  <td>
                    <span className={user.is_active ? 'company-status active' : 'company-status inactive'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="company-actions">
                    <button type="button" className="company-link" onClick={() => openEdit(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={user.is_active ? 'company-link danger' : 'company-link'}
                      onClick={() => toggleActive(user)}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && users.length === 0 && !error && (
              <tr>
                <td colSpan="10" className="company-empty">No users found.</td>
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
                  <label className="field-label" htmlFor="uf-employee">Employee ID</label>
                  <input id="uf-employee" className="field-input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} maxLength={50} />
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
              <span className="uf-title">Access</span>
              <div className="inv-form-grid">
                {modal.mode === 'create' && (
                  <div className="field">
                    <label className="field-label" htmlFor="uf-company">Company</label>
                    <select id="uf-company" className="field-input" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value, role_id: '' })}>
                      <option value="">No company yet</option>
                      {createCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} · {c.display_name || c.legal_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label className="field-label" htmlFor="uf-role">Role</label>
                  {modal.mode === 'create' ? (
                    <select id="uf-role" className="field-input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} disabled={!form.company_id}>
                      <option value="">{form.company_id ? 'No role yet' : 'Pick a company first'}</option>
                      {createRoles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="uf-help">Set per company below under Company access and roles.</span>
                  )}
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
              <span className="uf-title">Common Inventory</span>
              <label className="uf-check">
                <input
                  type="checkbox"
                  checked={form.common_inventory_access}
                  onChange={(e) => setForm({ ...form, common_inventory_access: e.target.checked })}
                />
                <span>Allow access to Common Inventory</span>
              </label>
            </section>
          </form>

          {modal.mode === 'edit' && <CompanyAccessPanel userId={modal.user.id} onError={setError} />}
        </Modal>
      )}

      {importing && (
        <UserImportModal
          onClose={() => setImporting(false)}
          onImported={() => {
            setNotice('User import finished. See the results in the import window.')
            load(search)
          }}
        />
      )}
    </div>
  )
}
