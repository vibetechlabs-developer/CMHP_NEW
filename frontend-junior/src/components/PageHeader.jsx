import Button from './Button'
import './PageHeader.css'

export default function PageHeader({
  breadcrumbs = [],
  title,
  subtitle,
  pill,
  primaryAction,
  secondaryAction,
  children,
}) {
  return (
    <div className="page-header-container">
      <div className="page-header-main">
        {breadcrumbs.length > 0 && (
          <nav className="page-header-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1
              const label = typeof crumb === 'string' ? crumb : crumb.label
              return (
                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`page-breadcrumb-item ${isLast ? 'active' : ''}`}>
                    {label}
                  </span>
                  {!isLast && <span className="page-breadcrumb-separator">/</span>}
                </span>
              )
            })}
          </nav>
        )}

        <div className="page-header-title-row">
          <h1 className="page-header-title">{title}</h1>
          {pill && <span className="page-header-pill">{pill}</span>}
        </div>

        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>

      <div className="page-header-actions">
        {secondaryAction && (
          <Button
            type="button"
            variant={secondaryAction.variant || 'secondary'}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.icon && <span style={{ marginRight: 4 }}>{secondaryAction.icon}</span>}
            {secondaryAction.label}
          </Button>
        )}

        {primaryAction && (
          <Button
            type="button"
            variant={primaryAction.variant || 'primary'}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.icon && <span style={{ marginRight: 4 }}>{primaryAction.icon}</span>}
            {primaryAction.label}
          </Button>
        )}

        {children}
      </div>
    </div>
  )
}
