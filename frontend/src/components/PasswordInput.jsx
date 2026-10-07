import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'
import './components.css'

export default function PasswordInput({ label, id, error, icon, ...rest }) {
  const [visible, setVisible] = useState(false)

  const inputClass = [
    'field-input',
    icon ? 'field-input-with-icon' : '',
    'field-input-with-toggle',
    error ? 'field-input-error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <div className="field-control">
        {icon && <span className="field-icon">{icon}</span>}
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={inputClass}
          {...rest}
        />
        <button
          type="button"
          className="field-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}