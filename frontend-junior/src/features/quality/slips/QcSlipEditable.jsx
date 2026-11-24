import React, { useRef, useEffect } from 'react'

/**
 * QcSlipInput:
 * Dotted-underline editable input field for slip data values.
 * - On screen: dotted-underline input with focus highlight.
 * - In print / PDF: clean text baseline with no border or background.
 */
export function QcSlipInput({
  value = '',
  onChange,
  className = '',
  style = {},
  placeholder = '',
  readOnly = false,
  disabled = false,
  align = 'left',
  bold = false,
  ...props
}) {
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'

  return (
    <input
      type="text"
      className={`qc-slip-input ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange && onChange(e.target.value, e)}
      readOnly={readOnly}
      disabled={disabled}
      style={{
        textAlign,
        fontWeight: bold ? 700 : 400,
        ...style,
      }}
      {...props}
    />
  )
}

/**
 * QcSlipText:
 * Click-to-edit component for slip labels, headers, and static text areas.
 * - On screen: appears as normal text; clicking allows inline editing of the text.
 * - In print / PDF: renders clean text with no outline.
 */
export function QcSlipText({
  value = '',
  onChange,
  className = '',
  style = {},
  readOnly = false,
  disabled = false,
  align = 'left',
  bold = false,
  as = 'input',
  ...props
}) {
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'

  if (as === 'textarea') {
    return (
      <textarea
        className={`qc-slip-text-field qc-slip-textarea ${className}`}
        value={value ?? ''}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        readOnly={readOnly}
        disabled={disabled}
        rows={props.rows || 2}
        style={{
          textAlign,
          fontWeight: bold ? 700 : 'inherit',
          ...style,
        }}
        {...props}
      />
    )
  }

  return (
    <input
      type="text"
      className={`qc-slip-text-field ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange && onChange(e.target.value, e)}
      readOnly={readOnly}
      disabled={disabled}
      style={{
        textAlign,
        fontWeight: bold ? 700 : 'inherit',
        ...style,
      }}
      {...props}
    />
  )
}
