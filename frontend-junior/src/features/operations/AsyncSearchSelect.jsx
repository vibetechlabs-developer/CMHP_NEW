import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import Spinner from '../../components/Spinner'

// Reuses CustomerSearchSelect.css's existing, already-polished markup/
// class names on purpose - same visual design, different data source.
// CustomerSearchSelect.jsx filters a fully-preloaded array in memory,
// which does not scale; this instead calls `fetchOptions(searchTerm)`
// (a real, debounced, server-side search call) and renders whatever it
// returns - correct for a 2000+ row product list, not just the handful
// of demo rows this project has today.
import './CustomerSearchSelect.css'

const DEBOUNCE_MS = 300

export default function AsyncSearchSelect({
  value = '',
  selected = null,
  id,
  onChange,
  fetchOptions, // async (searchTerm) => [{id, label, meta}]
  getOptionLabel = (option) => option?.label || '',
  getOptionMeta = () => '',
  placeholder = 'Search...',
  emptyLabel = 'No results found.',
  disabled = false,
  required = false,
}) {
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)

  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const [selectedLabel, setSelectedLabel] = useState('')

  // The selected record is supplied by the parent, so a saved value still shows
  // its name when it is not in the current search results.
  const selectedOption = useMemo(() => {
    if (value === '' || value === null || value === undefined) return null
    return (
      options.find((option) => String(option.id) === String(value)) ||
      (selected && String(selected.id) === String(value) ? selected : null)
    )
  }, [options, value, selected])

  // Keep the displayed text in sync with a `value` the caller set
  // directly (e.g. editing an existing order) without requiring the
  // matching option to already be in the current search results.
  useEffect(() => {
    if (!open && selectedOption) {
      setSelectedLabel(getOptionLabel(selectedOption))
    }
  }, [open, selectedOption, getOptionLabel])

  const runSearch = (term) => {
    const thisRequestId = ++requestIdRef.current
    setLoading(true)
    fetchOptions(term)
      .then((results) => {
        if (requestIdRef.current !== thisRequestId) return // a newer search superseded this one
        setOptions(Array.isArray(results) ? results : [])
        setLoading(false)
      })
      .catch(() => {
        if (requestIdRef.current !== thisRequestId) return
        setOptions([])
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(search), DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open])

  const updateDropdownPosition = () => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setDropdownPosition({ top: rect.bottom + 6, left: rect.left, width: rect.width })
  }

  const openDropdown = () => {
    if (disabled) return
    updateDropdownPosition()
    setOpen(true)
    setHighlightedIndex(0)
    runSearch(search)
  }

  // The dropdown is a fixed-position portal anchored to the input's
  // on-screen position at the moment it opened. Without this, scrolling
  // the page (or the panel resizing) after that leaves it stranded at its
  // original screen coordinates while the input moves away underneath it
  // - it then visually "detaches" and appears to sit inside whatever
  // later section the page happened to scroll up into view. Keep it
  // re-anchored for as long as it's open; `capture: true` also catches
  // scrolling inside a nested scrollable panel, not just the window.
  useEffect(() => {
    if (!open) return
    const reposition = () => updateDropdownPosition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selectOption = (option) => {
    if (!option) return
    onChange?.(option)
    setSelectedLabel(getOptionLabel(option))
    setOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const clearSelection = () => {
    onChange?.(null)
    setSearch('')
    setSelectedLabel('')
    setOpen(true)
    requestAnimationFrame(() => {
      updateDropdownPosition()
      inputRef.current?.focus()
    })
  }

  const handleChange = (event) => {
    const nextValue = event.target.value
    setSearch(nextValue)
    setOpen(true)
    setHighlightedIndex(0)
    if (selectedOption && nextValue !== getOptionLabel(selectedOption)) {
      onChange?.(null)
    }
  }

  const handleKeyDown = (event) => {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        openDropdown()
        return
      }
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && options[highlightedIndex]) {
        event.preventDefault()
        selectOption(options[highlightedIndex])
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setSearch(selectedOption ? getOptionLabel(selectedOption) : '')
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const clickedInside = wrapperRef.current?.contains(event.target)
      const clickedDropdown = dropdownRef.current?.contains(event.target)
      if (!clickedInside && !clickedDropdown) {
        setOpen(false)
        setSearch(selectedOption ? getOptionLabel(selectedOption) : '')
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [selectedOption, getOptionLabel])

  const displayValue = open ? search : selectedOption ? getOptionLabel(selectedOption) : selectedLabel

  const dropdown =
    open && !disabled && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            className="customer-search-dropdown"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: Math.max(200, window.innerHeight - dropdownPosition.top - 16),
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="customer-search-header">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {loading && <Spinner size="xs" tone="muted" />}
                {loading ? 'Searching...' : search ? 'Search results' : 'Suggestions'}
              </span>
              <span className="customer-search-count">{options.length} shown</span>
            </div>
            <div className="customer-search-options" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {options.length > 0 ? (
                options.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    data-customer-index={index}
                    className={`customer-search-option ${index === highlightedIndex ? 'is-highlighted' : ''} ${
                      String(value) === String(option.id) ? 'is-selected' : ''
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span className="customer-option-content">
                      <span className="customer-option-name">{getOptionLabel(option)}</span>
                      <span className="customer-option-meta">{getOptionMeta(option)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="customer-search-empty">
                  <strong>{loading ? 'Searching...' : emptyLabel}</strong>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div ref={wrapperRef} className={`customer-search-control ${open ? 'is-open' : ''}`}>
        <svg className="customer-search-leading-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="customer-search-input"
          value={displayValue}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          required={required && !value}
          aria-expanded={open}
          aria-haspopup="listbox"
          onFocus={openDropdown}
          onClick={openDropdown}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {displayValue && (
          <button
            type="button"
            className="customer-search-clear"
            aria-label="Clear selection"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearSelection}
          >
            ×
          </button>
        )}
        <span className={`customer-search-chevron ${open ? 'open' : ''}`}>▼</span>
      </div>
      {dropdown}
    </>
  )
}
