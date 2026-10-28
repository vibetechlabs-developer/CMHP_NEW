import Spinner from './Spinner'
import './components.css'

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  loading = false,
  loadingText = 'Please wait...',
  fullWidth = false,
  disabled = false,
  className: extraClassName,
  ...rest
}) {
  const className = ['btn', `btn-${variant}`, fullWidth ? 'btn-full' : '', extraClassName]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={className} disabled={disabled || loading} {...rest}>
      {loading ? (
        <>
          {/* `current` inherits each variant's own text colour, so one
              spinner works on the solid primary/danger fills and the
              light secondary/warning fills alike. */}
          <Spinner size="sm" tone="current" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  )
}