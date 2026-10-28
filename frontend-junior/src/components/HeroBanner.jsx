import './HeroBanner.css'

export default function HeroBanner({
  eyebrow,
  title,
  subtitle,
  children,
  className = '',
}) {
  return (
    <header className={`hero-banner ${className}`}>
      <div className="hero-banner-content">
        {eyebrow && <span className="hero-banner-eyebrow">{eyebrow}</span>}
        <h1 className="hero-banner-title">{title}</h1>
        {subtitle && <p className="hero-banner-subtitle">{subtitle}</p>}
        {children}
      </div>

      <div className="hero-banner-mark" aria-hidden="true">
        <span>+</span>
      </div>
    </header>
  )
}
