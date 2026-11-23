import { useRef } from 'react'

/**
 * Styled file-picker that hides the native "Choose file | No file chosen" input
 * and shows a branded button + selected filename instead.
 *
 * Usage:
 *   <FileInputButton
 *     id="my-file"
 *     accept=".csv,text/csv"
 *     disabled={busy}
 *     onChange={handleFile}
 *   />
 */
export default function FileInputButton({
  id,
  accept,
  disabled = false,
  onChange,
  label = '📂 Choose File',
  ariaLabel,
  fileName = '',
}) {
  const ref = useRef(null)

  const handleClick = () => {
    if (!disabled) ref.current?.click()
  }

  const handleChange = (e) => {
    if (onChange) onChange(e)
  }

  return (
    <div className="file-input-btn-wrap">
      {/* Hidden native input */}
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-label={ariaLabel || label}
      />
      {/* Styled trigger button */}
      <button
        type="button"
        className="file-input-btn"
        onClick={handleClick}
        disabled={disabled}
      >
        {label}
      </button>
      {/* Filename display */}
      <span className={`file-input-name ${fileName ? 'has-file' : ''}`}>
        {fileName ? `📄 ${fileName}` : 'No file chosen'}
      </span>
    </div>
  )
}
