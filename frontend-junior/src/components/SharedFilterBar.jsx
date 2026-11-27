import React, { useState, useEffect } from 'react'
import { DOSAGE_FORMS } from '../constants/dosageForms'
import './SharedFilterBar.css'

/**
 * Helper to compute date range from quick preset
 */
function getPresetDateRange(presetKey) {
  const now = new Date()
  const formatYMD = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const todayStr = formatYMD(now)

  switch (presetKey) {
    case 'TODAY':
      return { from: todayStr, to: todayStr }
    case 'YESTERDAY': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = formatYMD(y)
      return { from: yStr, to: yStr }
    }
    case 'THIS_WEEK': {
      const start = new Date(now)
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)
      return { from: formatYMD(start), to: todayStr }
    }
    case 'THIS_MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: formatYMD(start), to: todayStr }
    }
    case 'LAST_30': {
      const past = new Date(now)
      past.setDate(past.getDate() - 30)
      return { from: formatYMD(past), to: todayStr }
    }
    case 'ALL':
    default:
      return { from: '', to: '' }
  }
}

/**
 * SharedFilterBar
 * Universal responsive single-row filter bar component with Date-wise filter presets,
 * date range inputs, company selector, product type selector, and live search.
 */
export default function SharedFilterBar({
  search = '',
  onSearchChange,
  typeFilter = 'ALL',
  onTypeChange,
  companyFilter = 'ALL',
  onCompanyChange,
  fromDate = '',
  onFromDateChange,
  toDate = '',
  onToDateChange,
  onReset,
  placeholder = 'Search by Order #, Product, Batch...',
  showTypeFilter = true,
  showCompanyFilter = true,
  showDateFilter = true,
}) {
  const [datePreset, setDatePreset] = useState('ALL')

  // Detect preset when fromDate/toDate are cleared externally
  useEffect(() => {
    if (!fromDate && !toDate) {
      setDatePreset('ALL')
    }
  }, [fromDate, toDate])

  const handlePresetChange = (e) => {
    const val = e.target.value
    setDatePreset(val)
    if (val === 'CUSTOM') {
      // Keep existing dates for manual tweaking
      return
    }
    const { from, to } = getPresetDateRange(val)
    if (onFromDateChange) onFromDateChange(from)
    if (onToDateChange) onToDateChange(to)
  }

  const handleCustomDateChange = (type, val) => {
    setDatePreset('CUSTOM')
    if (type === 'from' && onFromDateChange) onFromDateChange(val)
    if (type === 'to' && onToDateChange) onToDateChange(val)
  }

  const handleResetClick = () => {
    setDatePreset('ALL')
    if (onReset) onReset()
  }

  const isFiltered = Boolean(
    search ||
      (typeFilter && typeFilter !== 'ALL') ||
      (companyFilter && companyFilter !== 'ALL') ||
      fromDate ||
      toDate ||
      datePreset !== 'ALL'
  )

  return (
    <div className="shared-filter-bar">
      {/* 1. Search Box */}
      <div className="sfb-search-wrap">
        <span className="sfb-search-icon">🔍</span>
        <input
          type="text"
          className="sfb-search-input"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="sfb-clear-search-btn"
            onClick={() => onSearchChange && onSearchChange('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* 2. Product Type select */}
      {showTypeFilter && (
        <div className="sfb-control-group">
          <label className="sfb-label">Type:</label>
          <select
            className="sfb-select sfb-type-select"
            value={typeFilter}
            onChange={(e) => onTypeChange && onTypeChange(e.target.value)}
            aria-label="Filter by Product Type"
          >
            <option value="ALL">All Types</option>
            {DOSAGE_FORMS.map((df) => (
              <option key={df} value={df}>
                {df}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 3. Company select */}
      {showCompanyFilter && (
        <div className="sfb-control-group">
          <label className="sfb-label">Company:</label>
          <select
            className="sfb-select sfb-company-select"
            value={companyFilter}
            onChange={(e) => onCompanyChange && onCompanyChange(e.target.value)}
            aria-label="Filter by Company"
          >
            <option value="ALL">All Companies</option>
            <option value="cmhp">CMHP Pharma</option>
            <option value="tej">Tej Biocare</option>
          </select>
        </div>
      )}

      {/* 4. DATE WISE FILTER (Preset + From/To Range) */}
      {showDateFilter && (
        <div className="sfb-date-section">
          {/* Quick Date-wise preset */}
          <div className="sfb-control-group">
            <label className="sfb-label">📅 Date:</label>
            <select
              className="sfb-select sfb-preset-select"
              value={datePreset}
              onChange={handlePresetChange}
              aria-label="Quick Date Preset"
            >
              <option value="ALL">All Dates</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_30">Last 30 Days</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </div>

          {/* Date range pickers: From / To */}
          <div className="sfb-date-pickers">
            <div className="sfb-date-field">
              <span className="sfb-date-sublabel">From:</span>
              <input
                type="date"
                className="sfb-date-input"
                value={fromDate}
                onChange={(e) => handleCustomDateChange('from', e.target.value)}
                aria-label="Filter from date"
              />
            </div>

            <div className="sfb-date-field">
              <span className="sfb-date-sublabel">To:</span>
              <input
                type="date"
                className="sfb-date-input"
                value={toDate}
                onChange={(e) => handleCustomDateChange('to', e.target.value)}
                aria-label="Filter to date"
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Reset Filters button */}
      {isFiltered && onReset && (
        <button
          type="button"
          className="sfb-reset-btn"
          onClick={handleResetClick}
          title="Reset all filters"
        >
          ✕ Reset
        </button>
      )}
    </div>
  )
}
