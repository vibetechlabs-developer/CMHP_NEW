import './components.css'

export default function Alert({ type = 'error', children }) {
  if (!children) return null

  return (
    <div className={`alert alert-${type}`} role="alert">
      {children}
    </div>
  )
}