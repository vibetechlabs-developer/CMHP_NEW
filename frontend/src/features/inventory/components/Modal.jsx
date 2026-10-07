import { useEffect, useRef } from 'react'

import './Modal.css'

// Open dialogs, innermost last. Only the top dialog handles Escape and Tab,
// so a dialog opened from inside another one does not close both.
const openDialogs = []
let scrollLockCount = 0

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// size: 'sm' | 'md' (default) | 'lg' | 'workspace'
// Layout is three regions: head (auto), body (scrolls), footer (auto).
// subheader sits inside the head region so it never scrolls away or
// overlaps the footer.
export default function Modal({ title, onClose, children, footer, subheader, size = 'md' }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const token = {}
    const previouslyFocused = document.activeElement
    openDialogs.push(token)

    scrollLockCount += 1
    if (scrollLockCount === 1) document.body.style.overflow = 'hidden'

    const focusable = () =>
      dialogRef.current ? Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)) : []

    const first = focusable()[0]
    if (first) first.focus()

    const handleKeyDown = (event) => {
      if (openDialogs[openDialogs.length - 1] !== token) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const index = openDialogs.indexOf(token)
      if (index !== -1) openDialogs.splice(index, 1)
      scrollLockCount -= 1
      if (scrollLockCount === 0) document.body.style.overflow = ''
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [])

  return (
    <div className="inv-modal-overlay" onClick={() => onCloseRef.current?.()}>
      <div
        ref={dialogRef}
        className={`inv-modal inv-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inv-modal-head">
          <div className="inv-modal-header">
            <h3>{title}</h3>
            <button type="button" className="inv-modal-close" onClick={() => onCloseRef.current?.()} aria-label="Close">
              ×
            </button>
          </div>
          {subheader && <div className="inv-modal-subheader">{subheader}</div>}
        </div>
        <div className="inv-modal-body">{children}</div>
        {footer && <div className="inv-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
