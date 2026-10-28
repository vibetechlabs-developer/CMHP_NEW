import './components.css'

export default function Input({ label, id, error, icon, ...rest }) {
  const inputClass = [
    'field-input',
    icon ? 'field-input-with-icon' : '',
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
        <input id={id} className={inputClass} {...rest} />
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}