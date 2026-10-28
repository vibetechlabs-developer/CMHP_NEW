import { useEffect, useMemo, useState } from 'react'

import useAuth from '../../hooks/useAuth'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { getErrorMessage } from '../../utils/errors'

import PageHeader from '../../components/PageHeader'
import Modal from '../inventory/components/Modal'
import { recordAudit } from '../../utils/audit'

import { companyService } from '../companies/companyService'
import { hrService } from './hrService'
import { allowedCompanyIds, canManageMasters } from './permissions'

import '../companies/Companies.css'
import './Hrms.css'


const HOLIDAY_TYPES = [
  ['NATIONAL', 'National Holiday'],
  ['FESTIVAL', 'Festival'],
  ['OPTIONAL', 'Optional / Restricted'],
  ['COMPANY', 'Company Holiday'],
]

const HOLIDAY_TYPE_LABELS = Object.fromEntries(HOLIDAY_TYPES)

const currentYear = new Date().getFullYear().toString()

const EMPTY_FORM = {
  name: '',
  date: '',
  type: 'NATIONAL',
  description: '',
  company: '',
}


export default function Holidays() {
  const { user } = useAuth()

  const scopedCompanies = allowedCompanyIds(user)
  const canManage = canManageMasters(user)

  const [holidays, setHolidays] = useState([])
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar'
  const [page, setPage] = useState(1)
  const pageSize = 12

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)


  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [holidaysResponse, companiesResponse] = await Promise.all([
        hrService.getHolidays(scopedCompanies),
        companyService.getCompanies(),
      ])

      setHolidays(holidaysResponse.data || [])
      setCompanies((companiesResponse.data || []).filter((c) => c.is_active))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, yearFilter, typeFilter, companyFilter])


  const companyName = (id) => {
    if (!id) {
      return 'Both companies'
    }

    return companies.find((c) => Number(c.id) === Number(id))?.name || '\u2014'
  }

  // Derive available years from holiday dates
  const availableYears = Array.from(
    new Set([
      currentYear,
      ...holidays.map((h) => h.date?.slice(0, 4)).filter(Boolean),
    ])
  ).sort().reverse()


  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }


  const openEdit = (holiday) => {
    setEditing(holiday)

    setForm({
      name: holiday.name || '',
      date: holiday.date || '',
      type: holiday.type || 'NATIONAL',
      description: holiday.description || '',
      company: holiday.company ? String(holiday.company) : '',
    })

    setError('')
    setModalOpen(true)
  }


  const save = async (event) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Holiday name is required.')
      return
    }

    if (!form.date) {
      setError('Holiday date is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        type: form.type || 'NATIONAL',
        description: form.description.trim(),
        company: form.company ? Number(form.company) : null,
      }

      if (editing) {
        await hrService.updateHoliday(editing.id, payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Holiday',
          entityId: String(editing.id),
          referenceNumber: payload.name,
          action: 'UPDATE',
          before: {
            name: editing.name,
            date: editing.date,
            type: editing.type,
            company: editing.company,
          },
          after: payload,
        })
      } else {
        await hrService.createHoliday(payload)

        recordAudit({
          user,
          module: 'HRMS',
          entityType: 'Holiday',
          entityId: payload.name,
          referenceNumber: payload.name,
          action: 'CREATE',
          after: payload,
        })
      }

      setModalOpen(false)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  const remove = async (holiday) => {
    if (!window.confirm(`Remove "${holiday.name}" from the holiday calendar?`)) {
      return
    }

    setError('')

    try {
      await hrService.deleteHoliday(holiday.id)

      recordAudit({
        user,
        module: 'HRMS',
        entityType: 'Holiday',
        entityId: String(holiday.id),
        referenceNumber: holiday.name,
        action: 'DELETE',
        before: holiday,
      })

      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }


  const filteredHolidays = holidays
    .filter((h) => {
      if (yearFilter !== 'ALL' && h.date) {
        return h.date.startsWith(yearFilter)
      }
      return true
    })
    .filter((h) => {
      if (typeFilter !== 'ALL') {
        return (h.type || 'NATIONAL') === typeFilter
      }
      return true
    })
    .filter((h) => {
      if (companyFilter !== 'ALL') {
        return !h.company || Number(h.company) === Number(companyFilter)
      }
      return true
    })
    .filter((h) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [h.name, h.date, h.description, companyName(h.company)]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q))
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const todayStr = new Date().toISOString().slice(0, 10)

  // Highlight next upcoming holiday
  const nextHoliday = useMemo(() => {
    return (
      holidays
        .filter((h) => h.date && h.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null
    )
  }, [holidays, todayStr])

  const daysUntilNext = useMemo(() => {
    if (!nextHoliday) return null
    const diffTime = new Date(nextHoliday.date).getTime() - new Date(todayStr).getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today!'
    if (diffDays === 1) return 'Tomorrow'
    return `In ${diffDays} days`
  }, [nextHoliday, todayStr])

  const kpis = useMemo(() => {
    const total = holidays.length
    const national = holidays.filter((h) => h.type === 'NATIONAL').length
    const festival = holidays.filter((h) => h.type === 'FESTIVAL').length
    const companyOrOpt = holidays.filter((h) => h.type === 'COMPANY' || h.type === 'OPTIONAL').length
    return { total, national, festival, companyOrOpt }
  }, [holidays])

  const hasActiveFilters = Boolean(
    search || yearFilter !== 'ALL' || typeFilter !== 'ALL' || companyFilter !== 'ALL'
  )

  const resetFilters = () => {
    setSearch('')
    setYearFilter('ALL')
    setTypeFilter('ALL')
    setCompanyFilter('ALL')
  }

  // 12-month grouping for Calendar view
  const monthsData = useMemo(() => {
    const targetYear = yearFilter === 'ALL' ? currentYear : yearFilter
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    return monthNames.map((name, idx) => {
      const monthPrefix = `${targetYear}-${String(idx + 1).padStart(2, '0')}`
      const monthHolidays = holidays.filter((h) => h.date && h.date.startsWith(monthPrefix))
      return {
        monthIndex: idx + 1,
        monthName: name,
        year: targetYear,
        holidays: monthHolidays,
      }
    })
  }, [holidays, yearFilter])

  const totalPages = Math.max(1, Math.ceil(filteredHolidays.length / pageSize))
  const paginatedHolidays = filteredHolidays.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="hr-page">
      <PageHeader
        breadcrumbs={[
          { label: 'HRMS', to: '/hrms' },
          { label: 'Holidays' }
        ]}
        title="Holiday Calendar"
        subtitle="Annual statutory, festival, and corporate holidays. Feeds attendance schedules and leave balances."
        primaryAction={
          canManage
            ? {
                label: '+ Add Holiday',
                onClick: openCreate,
              }
            : undefined
        }
      />

      {/* FEATURED NEXT UPCOMING HOLIDAY CARD */}
      {nextHoliday && (
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: 14,
            padding: '18px 22px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 18,
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>{nextHoliday.date ? new Date(nextHoliday.date).getDate() : '—'}</span>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 }}>
                {nextHoliday.date ? new Date(nextHoliday.date).toLocaleString('default', { month: 'short' }) : ''}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#1d4ed8',
                    letterSpacing: 0.5,
                  }}
                >
                  NEXT UPCOMING HOLIDAY &middot; {daysUntilNext}
                </span>
                <span
                  style={{
                    background: '#ffffff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {HOLIDAY_TYPE_LABELS[nextHoliday.type] || nextHoliday.type}
                </span>
              </div>

              <h2 style={{ margin: '4px 0 2px 0', fontSize: 18, color: '#1e3a8a', fontWeight: 800 }}>
                {nextHoliday.name}
              </h2>

              <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                {nextHoliday.description || 'Full-day public holiday recognized across company facilities.'}{' '}
                &middot; Applies to: <strong>{companyName(nextHoliday.company)}</strong>
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Calendar Date</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a' }}>
              {new Date(nextHoliday.date).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="hr-kpis-grid" style={{ marginBottom: 20 }}>
        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Total Holidays</span><span>🎉</span></div>
          <div className="hr-kpi-val">{kpis.total}</div>
          <div className="hr-kpi-sub">Total in annual calendar</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">National Holidays</span><span>🇮🇳</span></div>
          <div className="hr-kpi-val" style={{ color: '#2563eb' }}>{kpis.national}</div>
          <div className="hr-kpi-sub">Mandatory gazetted days</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Festivals</span><span>🪔</span></div>
          <div className="hr-kpi-val" style={{ color: '#d97706' }}>{kpis.festival}</div>
          <div className="hr-kpi-sub">Cultural &amp; religious days</div>
        </div>

        <div className="hr-kpi-link">
          <div className="hr-kpi-head"><span className="hr-kpi-title">Company / Optional</span><span>🏢</span></div>
          <div className="hr-kpi-val" style={{ color: '#7c3aed' }}>{kpis.companyOrOpt}</div>
          <div className="hr-kpi-sub">Unit-specific or restricted</div>
        </div>
      </div>

      {error && !modalOpen && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* MAIN DATA SECTION */}
      <div className="hr-table-card">
        {/* TOOLBAR */}
        <div className="hr-toolbar">
          <div className="hr-search-box">
            <span className="hr-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search holiday name, date, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="hr-filter-item">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="ALL">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Year {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All Types</option>
              {HOLIDAY_TYPES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="hr-filter-item">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="ALL">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="hr-clear-filter"
              onClick={resetFilters}
            >
              ✕ Clear filters
            </button>
          )}

          <div className="hr-toolbar-actions">
            <div className="hr-view-toggle">
              <button
                type="button"
                className={`hr-view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                📋 List View
              </button>
              <button
                type="button"
                className={`hr-view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
              >
                🗓️ Calendar View
              </button>
            </div>
          </div>
        </div>

        {/* LOADING SKELETON */}
        {loading && (
          <div className="hr-skeleton-loader">
            <div className="hr-skeleton-row" style={{ width: '100%', height: 30 }} />
            <div className="hr-skeleton-row" style={{ width: '90%' }} />
            <div className="hr-skeleton-row" style={{ width: '95%' }} />
          </div>
        )}

        {/* VIEW A: LIST TABLE */}
        {!loading && viewMode === 'list' && (
          <div className="hr-table-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Holiday Name</th>
                  <th>Type</th>
                  <th>Applies To</th>
                  {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {paginatedHolidays.map((holiday) => {
                  const typeClass =
                    holiday.type === 'NATIONAL'
                      ? 'present'
                      : holiday.type === 'FESTIVAL'
                      ? 'late'
                      : holiday.type === 'OPTIONAL'
                      ? 'on-leave'
                      : 'neutral'

                  return (
                    <tr key={holiday.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{holiday.date}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {new Date(holiday.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{holiday.name}</div>
                        {holiday.description && (
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {holiday.description}
                          </div>
                        )}
                      </td>

                      <td>
                        <span className={`hr-badge ${typeClass}`}>
                          {HOLIDAY_TYPE_LABELS[holiday.type] || 'Holiday'}
                        </span>
                      </td>

                      <td>
                        <span className="company-code">{companyName(holiday.company)}</span>
                      </td>

                      {canManage && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="table-edit"
                            onClick={() => openEdit(holiday)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="table-delete"
                            onClick={() => remove(holiday)}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}

                {filteredHolidays.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4}>
                      <div className="hr-empty-state">
                        <div className="hr-empty-icon">🗓️</div>
                        <div className="hr-empty-title">No holidays found</div>
                        <div className="hr-empty-desc">
                          {holidays.length === 0
                            ? 'No holidays configured yet. Click "+ Add Holiday" to create one.'
                            : 'No holidays match the selected search or filters.'}
                        </div>
                        {hasActiveFilters && (
                          <Button variant="secondary" style={{ marginTop: 12 }} onClick={resetFilters}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW B: 12-MONTH CALENDAR GRID */}
        {!loading && viewMode === 'calendar' && (
          <div style={{ padding: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {monthsData.map((m) => (
                <div
                  key={m.monthIndex}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: 8,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>
                      {m.monthName} {m.year}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        background: m.holidays.length > 0 ? '#eff6ff' : '#f8fafc',
                        color: m.holidays.length > 0 ? '#2563eb' : '#94a3b8',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontWeight: 700,
                      }}
                    >
                      {m.holidays.length} holiday{m.holidays.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {m.holidays.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '10px 0' }}>
                      No holidays scheduled
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {m.holidays.map((h) => {
                        const typeClass =
                          h.type === 'NATIONAL'
                            ? 'present'
                            : h.type === 'FESTIVAL'
                            ? 'late'
                            : h.type === 'OPTIONAL'
                            ? 'on-leave'
                            : 'neutral'

                        return (
                          <div
                            key={h.id}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #f1f5f9',
                              borderRadius: 8,
                              padding: '8px 10px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>
                                {h.name}
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                {new Date(h.date).getDate()} {m.monthName.slice(0, 3)} &middot; {companyName(h.company)}
                              </div>
                            </div>
                            <span className={`hr-badge ${typeClass}`} style={{ fontSize: 9 }}>
                              {h.type}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGINATION (for list view) */}
        {!loading && viewMode === 'list' && (
          <div className="hr-pagination">
            <div>
              Showing <strong>{filteredHolidays.length === 0 ? 0 : (page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, filteredHolidays.length)}</strong> of{' '}
              <strong>{filteredHolidays.length}</strong> holiday{filteredHolidays.length === 1 ? '' : 's'}
            </div>

            {totalPages > 1 && (
              <div className="hr-pagination-btns">
                <button
                  type="button"
                  className="hr-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  &larr; Prev
                </button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1
                  return (
                    <button
                      key={pNum}
                      type="button"
                      className={`hr-page-btn ${page === pNum ? 'active' : ''}`}
                      onClick={() => setPage(pNum)}
                    >
                      {pNum}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="hr-page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit holiday' : 'Add holiday'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>

              <Button loading={saving} onClick={save}>
                {editing ? 'Save changes' : 'Add holiday'}
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={save}>
            <div className="company-form-grid">
              <Input
                label="Holiday name"
                placeholder="e.g. Independence Day, Diwali"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <div className="field">
                <label className="field-label">Date</label>
                <input
                  className="field-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label">Holiday type</label>
                <select
                  className="field-input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {HOLIDAY_TYPES.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label">Applies to</label>
                <select
                  className="field-input"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                >
                  <option value="">Both companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <Input
                  label="Description / Notes"
                  placeholder="Optional remarks or details"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}