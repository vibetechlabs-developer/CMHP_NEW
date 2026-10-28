import { useEffect } from 'react'
import './Modal.css'

export default function Modal({
  isOpen = true,
  title,
  subheader,
  onClose,
  children,
  footer,
  maxWidth,
  size = 'md',
  className = '',
}) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (isOpen === false) {
    return null
  }

  const modalClasses = ['inv-modal', `inv-modal-${size}`, className].filter(Boolean).join(' ')

  return (
    <div className={`inv-modal-overlay ${className}`.trim()} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={modalClasses}
        style={maxWidth ? { maxWidth, width: '100%' } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inv-modal-header">
          <div>
            <h3>{title}</h3>
            {subheader && <div className="inv-modal-subheader">{subheader}</div>}
          </div>
          <button
            type="button"
            className="inv-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="inv-modal-body">{children}</div>
        {footer && <div className="inv-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}