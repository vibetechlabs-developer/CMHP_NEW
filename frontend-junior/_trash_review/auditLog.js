const AUDIT_KEY =
  'cmhp_audit_log_v1'

function readLogs() {
  try {
    const raw =
      localStorage.getItem(
        AUDIT_KEY
      )

    const parsed =
      raw
        ? JSON.parse(raw)
        : []

    return Array.isArray(parsed)
      ? parsed
      : []
  } catch {
    return []
  }
}

export function addAuditLog({
  action,
  module,
  recordId = null,
  description,
  userId = null,
}) {

  const logs =
    readLogs()

  logs.unshift({
    id:
      `${Date.now()}-${Math.random()}`,

    action,
    module,
    recordId,
    description,
    userId,

    timestamp:
      new Date().toISOString(),
  })

  localStorage.setItem(
    AUDIT_KEY,
    JSON.stringify(
      logs.slice(0, 1000)
    )
  )
}

export function getAuditLogs() {
  return readLogs()
}

export function clearAuditLogs() {
  localStorage.removeItem(
    AUDIT_KEY
  )
}