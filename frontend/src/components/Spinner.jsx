import './Spinner.css'

// The one spinner for the whole app. Every screen that used to show plain
// "Loading…" text (or, in one place, its own one-off CSS ring) now renders
// this instead, so every loading state looks and animates the same way.
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

// Block variant: replaces an entire section/page/panel while it loads,
// instead of a lone line of text sitting in otherwise-empty space.
export function LoadingState({ label = 'Loading…', size = 'lg', compact = false, className = '' }) {
  return (
    <div className={`loading-state ${compact ? 'loading-state-compact' : ''} ${className}`.trim()}>
      <Spinner size={size} tone="brand" label={label} />
    </div>
  )
}
