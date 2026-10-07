import { useEffect, useState } from 'react'

import ConfirmDialog from '../features/operations/ConfirmDialog'

// Module-level bridge so existing handlers can `await confirmAction(...)`
// without threading a hook through every component. Mount ConfirmProvider once
// near the app root.
let openRequest = null

const DESTRUCTIVE = /\b(delete|remove|discard|cancel this|close without saving)\b/i

export function confirmAction(message, options = {}) {
  return new Promise((resolve) => {
    if (!openRequest) {
      resolve(false)
      return
    }
    const danger = options.danger ?? DESTRUCTIVE.test(message)
    const confirmLabel =
      options.confirmLabel ??
      (/delete|remove/i.test(message) ? 'Delete' : /discard|close without saving/i.test(message) ? 'Discard' : 'Confirm')
    openRequest({ message, title: options.title, confirmLabel, danger, resolve })
  })
}

export default function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)

  useEffect(() => {
    openRequest = (next) => setRequest(next)
    return () => {
      openRequest = null
    }
  }, [])

  const settle = (result) => {
    request?.resolve(result)
    setRequest(null)
  }

  return (
    <>
      {children}
      {request && (
        <ConfirmDialog
          title={request.title || (request.danger ? 'Please confirm' : 'Confirm action')}
          message={request.message}
          confirmLabel={request.confirmLabel}
          danger={request.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </>
  )
}
