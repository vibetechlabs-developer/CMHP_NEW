import React, { useRef, useEffect } from 'react'
import { formatDateDDMMYYYY, toIsoDate } from '../production/bmrDateUtils'

/**
 * QcAutoCell:
 * Standardized inline editable cell for Certificate of Analysis tables.
 * - On-screen: transparent, borderless, auto-growing textarea that expands with text.
 * - In print: vector text element with pre-wrap word-breaking that never clips or scrolls.
 */
export function QcAutoCell({
  value,
  onChange,
  className = 'qc-cell-input',
  style,
  placeholder = '',
  rows = 1,
  readOnly = false,
  disabled = false,
  align = 'left',
  ...props
}) {
  const textareaRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 18)}px`
    }
  }, [value])

  const handleInput = (e) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    if (onChange) onChange(e)
  }

  const textAlignStyle = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'

  return (
    <div
      className="qc-auto-cell-wrap"
      style={{
        width: '100%',
        minHeight: '18px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <textarea
        ref={textareaRef}
        rows={rows}
        className={`${className} no-print`}
        value={value || ''}
        placeholder={placeholder}
        onChange={handleInput}
        readOnly={readOnly}
        disabled={disabled}
        style={{
          width: '100%',
          resize: 'none',
          overflow: 'hidden',
          display: 'block',
          border: 'none',
          background: 'transparent',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: '1.2',
          textAlign: textAlignStyle,
          padding: '1px 2px',
          margin: 0,
          boxSizing: 'border-box',
          outline: 'none',
          ...style,
        }}
        {...props}
      />
      <div
        className="qc-cell-print-text print-only"
        style={{
          width: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: '1.2',
          textAlign: textAlignStyle,
          padding: '1px 2px',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {value || ''}
      </div>
    </div>
  )
}

/**
 * QcDateField:
 * Standardized Date Field:
 * - Display DD/MM/YYYY text + calendar picker icon on screen;
 * - Clean unbordered text in print preview / PDF.
 */
export function QcDateField({
  value,
  onChange,
  className = 'qc-cell-input',
  style,
  placeholder = 'DD/MM/YYYY',
  readOnly = false,
  disabled = false,
  align = 'center',
  ...props
}) {
  const hiddenInputRef = useRef(null)
  const displayVal = formatDateDDMMYYYY(value)

  const handleDisplayChange = (e) => {
    const raw = e.target.value
    if (!raw.trim()) {
      onChange({ target: { value: '' } })
      return
    }
    const parts = raw.split('/')
    if (parts.length === 3 && parts[2].length === 4) {
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      const y = parts[2]
      onChange({ target: { value: `${y}-${m}-${d}` } })
    } else {
      onChange({ target: { value: raw } })
    }
  }

  const openCalendar = (e) => {
    e.stopPropagation()
    if (hiddenInputRef.current && !readOnly && !disabled) {
      if (typeof hiddenInputRef.current.showPicker === 'function') {
        hiddenInputRef.current.showPicker()
      } else {
        hiddenInputRef.current.click()
      }
    }
  }

  const textAlignStyle = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'

  return (
    <div className="qc-date-wrap" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
      <input
        type="text"
        className={`${className} qc-date-display no-print`}
        value={displayVal}
        placeholder={placeholder}
        onChange={handleDisplayChange}
        onClick={openCalendar}
        readOnly={readOnly}
        disabled={disabled}
        style={{
          width: '100%',
          textAlign: textAlignStyle,
          paddingRight: '16px',
          boxSizing: 'border-box',
          border: 'none',
          background: 'transparent',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          outline: 'none',
          ...style,
        }}
        {...props}
      />
      <span
        className="qc-date-picker-icon no-print"
        title="Choose date"
        onClick={openCalendar}
        style={{
          position: 'absolute',
          right: '2px',
          cursor: 'pointer',
          fontSize: '11px',
          userSelect: 'none',
        }}
      >
        📅
      </span>
      <input
        ref={hiddenInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="no-print"
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
          bottom: 0,
          left: 0,
        }}
        value={toIsoDate(value)}
        onChange={(e) => {
          onChange({ target: { value: e.target.value } })
        }}
      />
      <span
        className="qc-date-print-value print-only"
        style={{
          width: '100%',
          textAlign: textAlignStyle,
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {displayVal || ''}
      </span>
    </div>
  )
}
