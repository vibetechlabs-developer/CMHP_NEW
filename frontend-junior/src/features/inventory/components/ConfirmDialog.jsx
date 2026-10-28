/**
 * ConfirmDialog — themed replacement for window.confirm()
 * PromptDialog  — themed replacement for window.prompt()
 *
 * Usage (imperative, promise-based):
 *   const ok = await showConfirm({ title, message, confirmLabel, variant })
 *   const text = await showPrompt({ title, message, placeholder, confirmLabel })
 *
 * Or use the hook:
 *   const { ConfirmNode, confirm, prompt } = useConfirmDialog()
 *   // Render <ConfirmNode /> somewhere in the tree.
 *   const ok = await confirm({ ... })
 *   const val = await prompt({ ... })
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import './ConfirmDialog.css'

// ---------------------------------------------------------------------------
// ConfirmDialog — boolean result
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary', // 'primary' | 'danger' | 'warning'
  icon,
  onConfirm,
  onCancel,
}) {
  const btnRef = useRef(null)

  useEffect(() => {
    if (isOpen && btnRef.current) {
      // small delay so the animation finishes before focus
      const t = setTimeout(() => btnRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const iconMap = {
    primary: icon || '❓',
    danger: icon || '⚠️',
    warning: icon || '⚠️',
  }

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className={`cd-box cd-box--${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cd-icon">{iconMap[variant]}</div>
        <h3 className="cd-title">{title}</h3>
        {message && <p className="cd-message">{message}</p>}
        <div className="cd-actions">
          <button className="cd-btn cd-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            id="cd-btn-confirm"
            ref={btnRef}
            className={`cd-btn cd-btn--${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PromptDialog — string result
// ---------------------------------------------------------------------------
export function PromptDialog({
  isOpen,
  title = 'Enter a value',
  message,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue || '')
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 80)
      return () => clearTimeout(t)
    }
  }, [isOpen, defaultValue])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [isOpen, onCancel])

  const handleSubmit = () => {
    if (!value.trim()) {
      inputRef.current?.focus()
      return
    }
    onConfirm?.(value.trim())
  }

  if (!isOpen) return null

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className={`cd-box cd-box--${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="cd-title">{title}</h3>
        {message && <p className="cd-message">{message}</p>}
        <input
          ref={inputRef}
          className="cd-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') onCancel?.()
          }}
        />
        <div className="cd-actions">
          <button className="cd-btn cd-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            id="cd-btn-prompt-confirm"
            className={`cd-btn cd-btn--${variant}`}
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// useConfirmDialog hook — single instance, imperative API
// ---------------------------------------------------------------------------
export function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState(null)  // { ...options, resolve }
  const [promptState, setPromptState]   = useState(null)  // { ...options, resolve }

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve })
    })
  }, [])

  const prompt = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setPromptState({ ...options, resolve })
    })
  }, [])

  const ConfirmNode = (
    <>
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || 'Confirm'}
        cancelLabel={confirmState?.cancelLabel || 'Cancel'}
        variant={confirmState?.variant || 'primary'}
        icon={confirmState?.icon}
        onConfirm={() => {
          confirmState?.resolve(true)
          setConfirmState(null)
        }}
        onCancel={() => {
          confirmState?.resolve(false)
          setConfirmState(null)
        }}
      />
      <PromptDialog
        isOpen={!!promptState}
        title={promptState?.title}
        message={promptState?.message}
        placeholder={promptState?.placeholder || ''}
        defaultValue={promptState?.defaultValue || ''}
        confirmLabel={promptState?.confirmLabel || 'OK'}
        cancelLabel={promptState?.cancelLabel || 'Cancel'}
        variant={promptState?.variant || 'primary'}
        onConfirm={(val) => {
          promptState?.resolve(val)
          setPromptState(null)
        }}
        onCancel={() => {
          promptState?.resolve(null)
          setPromptState(null)
        }}
      />
    </>
  )

  return { confirm, prompt, ConfirmNode }
}
