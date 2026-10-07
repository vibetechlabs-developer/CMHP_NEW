import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import Modal from '../inventory/components/Modal'

import { hrService } from './hrService'
import {
  allowedCompanyIds,
  canApproveLeave,
  canManageMasters,
} from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const EMPTY_APPLY_FORM = {
  leave_type: '',
  from_date: '',
  to_date: '',
  reason: '',
}

const EMPTY_TYPE_FORM = {
  name: '',
  code: '',
  paid: true,
  max_days_per_year: 12,
  company: '',
}

function diffDays(from, to) {
  if (!from || !to) {
    return 0
  }

  const days =
    Math.round(
      (new Date(to) - new Date(from)) / 86400000
    ) + 1

  return days > 0 ? days : 0
}


export default function Leave() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canApprove = canApproveLeave(user)
  const canManage = canManageMasters(user)
  const myCompany = user?.profile?.primary_company

  const [leaveTypes, setLeaveTypes] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [teamRequests, setTeamRequests] = useState([])

  const [applyForm, setApplyForm] = useState(EMPTY_APPLY_FORM)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [teamError, setTeamError] = useState('')

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM)
  const [savingType, setSavingType] = useState(false)
  const [typeError, setTypeError] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')


  const loadAll = async () => {
    setLoading(true)
    setError('')

    try {
      const [typesResponse, mineResponse] = await Promise.all([
        hrService.getLeaveTypes(scopedCompanies),
        hrService.getMyLeaveRequests(user.id),
      ])

      setLeaveTypes(typesResponse.data)
      setMyRequests(mineResponse.data)

      if (canApprove) {
        const teamResponse = await hrService.getLeaveRequests(
          scopedCompanies,
          statusFilter || null
        )
        setTeamRequests(teamResponse.data)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  useEffect(() => {
    if (!canApprove) {
      return
    }

    hrService
      .getLeaveRequests(scopedCompanies, statusFilter || null)
      .then((response) => setTeamRequests(response.data))
      .catch((err) => setTeamError(getErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])


  const activeLeaveTypes = leaveTypes.filter(
    (type) =>
      type.is_active &&
      (!type.company || Number(type.company) === Number(myCompany))
  )


  const submitApply = async (event) => {
    event.preventDefault()

    setApplying(true)
    setApplyError('')

    try {
      const days = diffDays(applyForm.from_date, applyForm.to_date)

      if (!applyForm.leave_type) {
        throw new Error('Please select a leave type.')
      }

      if (days <= 0) {
        throw new Error('Please pick a valid date range.')
      }

      await hrService.submitLeaveRequest({
        user: user.id,
        company: myCompany,
        leave_type: Number(applyForm.leave_type),
        from_date: applyForm.from_date,
        to_date: applyForm.to_date,
        days,
        reason: applyForm.reason.trim(),
      })

      setApplyForm(EMPTY_APPLY_FORM)
      await loadAll()
    } catch (err) {
      setApplyError(getErrorMessage(err) || err.message)
    } finally {
      setApplying(false)
    }
  }


  const cancelMine = async (request) => {
    if (!(await confirmAction('Cancel this leave request?'))) {
      return
    }

    setError('')

    try {
      await hrService.cancelLeaveRequest(request.id)
      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const decide = async (request, status) => {
    let note = ''

    if (status === 'REJECTED') {
      note = window.prompt('Optional note for this rejection:') || ''
    }

    setTeamError('')

    try {
      await hrService.decideLeaveRequest(request.id, status, user.id, note)

      const teamResponse = await hrService.getLeaveRequests(
        scopedCompanies,
        statusFilter || null
      )
      setTeamRequests(teamResponse.data)
    } catch (err) {
      setTeamError(getErrorMessage(err))
    }
  }


  const openCreateType = () => {
    setTypeForm(EMPTY_TYPE_FORM)
    setTypeError('')
    setTypeModalOpen(true)
  }


  const saveType = async (event) => {
    event.preventDefault()

    setSavingType(true)
    setTypeError('')

    try {
      await hrService.createLeaveType({
        name: typeForm.name.trim(),
        code: typeForm.code.trim().toUpperCase(),
        paid: Boolean(typeForm.paid),
        max_days_per_year: Number(typeForm.max_days_per_year) || 0,
        company: typeForm.company ? Number(typeForm.company) : null,
      })

      setTypeModalOpen(false)
      await loadAll()
    } catch (err) {
      setTypeError(getErrorMessage(err))
    } finally {
      setSavingType(false)
    }
  }


  const toggleTypeStatus = async (type) => {
    try {
      if (type.is_active) {
        await hrService.deactivateLeaveType(type.id)
      } else {
        await hrService.reactivateLeaveType(type.id)
      }

      await loadAll()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  return (
    <div className="hr-page">

      <div className="hr-header">
        <div>
          <span className="dash-pill" style={{ marginBottom: 6, display: 'inline-block' }}>
            HRMS
          </span>
          <h1>Leave</h1>
          <p>
            Apply for leave, track your requests, and (for HR roles)
            review the team&rsquo;s pending approvals (US-HR-6).
          </p>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}


      {/* APPLY FOR LEAVE */}
      <section className="company-panel">
        <div className="company-toolbar">
          <div>
            <h2>Apply for leave</h2>
            <p>Submit a new leave request</p>
          </div>
        </div>

        {applyError && <Alert type="error">{applyError}</Alert>}

        <form onSubmit={submitApply}>
          <div className="company-form-grid">
            <div className="field">
              <label className="field-label">Leave type</label>
              <select
                className="field-input"
                value={applyForm.leave_type}
                onChange={(e) =>
                  setApplyForm({ ...applyForm, leave_type: e.target.value })
                }
                required
              >
                <option value="">Select leave type</option>
                {activeLeaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} {type.paid ? '(Paid)' : '(Unpaid)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">From date</label>
              <input
                className="field-input"
                type="date"
                value={applyForm.from_date}
                onChange={(e) =>
                  setApplyForm({ ...applyForm, from_date: e.target.value })
                }
                required
              />
            </div>

            <div className="field">
              <label className="field-label">To date</label>
              <input
                className="field-input"
                type="date"
                value={applyForm.to_date}
                onChange={(e) =>
                  setApplyForm({ ...applyForm, to_date: e.target.value })
                }
                required
              />
            </div>

            <Input
              label="Reason"
              value={applyForm.reason}
              onChange={(e) =>
                setApplyForm({ ...applyForm, reason: e.target.value })
              }
            />
          </div>

          {applyForm.from_date && applyForm.to_date && (
            <p className="user-admin-help">
              {diffDays(applyForm.from_date, applyForm.to_date)} day(s) requested
            </p>
          )}

          <Button type="submit" loading={applying} loadingText="Submitting...">
            Submit request
          </Button>
        </form>

        {activeLeaveTypes.length === 0 && !loading && (
          <p className="dash-empty" style={{ marginTop: 10 }}>
            No leave types configured for your company yet. Ask an
            HR Administrator to add one below.
          </p>
        )}
      </section>


      {/* MY REQUESTS */}
      <section className="company-panel" style={{ marginTop: 18 }}>
        <div className="company-toolbar">
          <div>
            <h2>My leave requests</h2>
            <p>Most recent first</p>
          </div>
        </div>

        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Leave type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Status</th>
                <th>Reason</th>
                <th className="company-actions">Actions</th>
              </tr>
            </thead>

            <tbody>
              {myRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.leave_type_name}</td>
                  <td>{request.from_date}</td>
                  <td>{request.to_date}</td>
                  <td>{request.days}</td>
                  <td>
                    <span className={`leave-status leave-${request.status}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>{request.reason || '\u2014'}</td>
                  <td className="company-actions">
                    {request.status === 'PENDING' && (
                      <button
                        type="button"
                        className="company-link danger"
                        onClick={() => cancelMine(request)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {myRequests.length === 0 && (
                <tr>
                  <td colSpan="7" className="company-empty">
                    You have not applied for any leave yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* TEAM APPROVALS */}
      {canApprove && (
        <section className="company-panel" style={{ marginTop: 18 }}>
          <div className="company-toolbar">
            <div>
              <h2>Team approvals</h2>
              <p>Review leave requests for your team</p>
            </div>

            <select
              className="field-input"
              style={{ maxWidth: 180 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="PENDING">Pending only</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="">All statuses</option>
            </select>
          </div>

          {teamError && <Alert type="error">{teamError}</Alert>}

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th className="company-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {teamRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.employee_name}</strong>
                      <span className="company-address">
                        {request.employee_code}
                      </span>
                    </td>
                    <td>{request.leave_type_name}</td>
                    <td>{request.from_date}</td>
                    <td>{request.to_date}</td>
                    <td>{request.days}</td>
                    <td>
                      <span className={`leave-status leave-${request.status}`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="company-actions">
                      {request.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            className="company-link"
                            onClick={() => decide(request, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="company-link danger"
                            onClick={() => decide(request, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}

                {teamRequests.length === 0 && (
                  <tr>
                    <td colSpan="7" className="company-empty">
                      No leave requests found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}


      {/* LEAVE TYPES MASTER */}
      {canManage && (
        <section className="company-panel" style={{ marginTop: 18 }}>
          <div className="company-toolbar">
            <div>
              <h2>Leave types</h2>
              <p>Company-wise leave policy (US-HR-6.1)</p>
            </div>

            <Button onClick={openCreateType}>+ Add leave type</Button>
          </div>

          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Paid</th>
                  <th>Max days / year</th>
                  <th>Status</th>
                  <th className="company-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {leaveTypes.map((type) => (
                  <tr key={type.id}>
                    <td><strong>{type.name}</strong></td>
                    <td><span className="company-code">{type.code}</span></td>
                    <td>{type.paid ? 'Paid' : 'Unpaid'}</td>
                    <td>{type.max_days_per_year}</td>
                    <td>
                      <span className={type.is_active ? 'company-status active' : 'company-status inactive'}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="company-actions">
                      <button
                        type="button"
                        className={type.is_active ? 'company-link danger' : 'company-link'}
                        onClick={() => toggleTypeStatus(type)}
                      >
                        {type.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}

                {leaveTypes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="company-empty">No leave types added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {typeModalOpen && (
        <Modal
          title="Add leave type"
          onClose={() => setTypeModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTypeModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={savingType} onClick={saveType}>
                Add leave type
              </Button>
            </>
          }
        >
          <Alert type="error">{typeError}</Alert>

          <form onSubmit={saveType}>
            <div className="company-form-grid">
              <Input
                label="Name"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                required
              />

              <Input
                label="Code"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                required
              />

              <Input
                label="Max days / year"
                type="number"
                min="0"
                value={typeForm.max_days_per_year}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, max_days_per_year: e.target.value })
                }
              />

              <label className="user-inventory-option">
                <input
                  type="checkbox"
                  checked={typeForm.paid}
                  onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })}
                />
                <span>
                  <strong>Paid leave</strong>
                  <small>Uncheck for unpaid leave types</small>
                </span>
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}