import './components.css'

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  loading = false,
  loadingText = 'Please wait...',
  fullWidth = false,
  disabled = false,
  ...rest
}) {
  const className = ['btn', `btn-${variant}`, fullWidth ? 'btn-full' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={className} disabled={disabled || loading} {...rest}>
      {loading ? loadingText : children}
    </button>
  )
}