import React from 'react'
import { useSelector } from 'react-redux'
import useAuth from '../hooks/useAuth'
import { selectActiveCompanyKey } from '../utils/companySelectors'
import './PharmaHeroBanner.css'

/**
 * PharmaHeroBanner
 * Shared pharmaceutical hero banner extracted from Dashboard.
 * Displays the top pharmaceutical background banner (/pharma-banner.png),
 * company indicator, title, subtitle, date, and live system status pill.
 */
export default function PharmaHeroBanner({
  badge,
  title,
  subtitle,
  actions,
  children,
}) {
  const { user } = useAuth()
  const compKey = useSelector(selectActiveCompanyKey)
  const isCompanyB = compKey === 'tej'
  const companyName = isCompanyB ? 'Tej Biocare' : 'CMHP'

  const formattedToday = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <section className="dash-hero top-banner shared-pharma-hero">
      <div className="dash-hero-text">
        <span className="page-hero-pill">
          {badge || `🏢 ${companyName} Pharmaceutical Workspace`}
        </span>

        {title && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}

        <div className="dash-hero-meta-row">
          <span>📅 {formattedToday}</span>
          <span>&middot;</span>
          <span className="dash-hero-status-pill">● Live System Active</span>
        </div>

        {children}
      </div>

      {actions && <div className="shared-pharma-hero-actions">{actions}</div>}
    </section>
  )
}
