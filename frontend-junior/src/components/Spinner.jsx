import './Spinner.css'

// Ported from frontend/src/components/Spinner.jsx - a presentation-only,
// data-free loading indicator, reused here by the real-data Materials
// integration instead of inventing a one-off loading state.
export default function Spinner({
  size = 'md', // xs | sm | md | lg | xl
  tone = 'brand', // brand | light | muted | current
  label = '',
  className = '',
}) {
  return (
    <span className={`spinner-wrap ${className}`.trim()} role="status">
      <span className={`spinner spinner-${size} spinner-${tone}`} aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

export function LoadingState({ label = 'Loading…', size = 'lg', compact = false, className = '' }) {
  return (
    <div className={`loading-state ${compact ? 'loading-state-compact' : ''} ${className}`.trim()}>
      <Spinner size={size} tone="brand" label={label} />
    </div>
  )
}
