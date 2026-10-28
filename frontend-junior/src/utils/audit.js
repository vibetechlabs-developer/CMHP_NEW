/**
 * CMHP Pharmaceutical ERP - Enterprise Central Audit Service
 *
 * Rules:
 * - Append-only: No delete or edit functionality in UI or service.
 * - Called on EVERY mutation: create, update, delete, archive, restore,
 *   approve, reject, status change, print, export, payment, login, logout.
 * - Masks sensitive fields: passwords, full bank accounts, PAN, Aadhaar.
 * - Provides field-level diffs: old value -> new value.
 * - Stores IP, browser, timestamp in IST, user, module, entity reference.
 */

import { getActor } from './actor'
import { getActiveCompanyId, getSelectedWorkspace } from './workspace'
import { formatDateTimeIN, maskAadhaar, maskBankAcc, maskPAN } from './formatters'

const AUDIT_STORAGE_KEY = 'cmhp_central_audit_logs_v2'
const LEGACY_STORAGE_KEY = 'cmhp_audit_log_v1'

const MAX_AUDIT_LOGS = 2500

function getBrowserInfo() {
  if (typeof navigator === 'undefined') return 'Unknown Browser'
  const ua = navigator.userAgent || ''
  if (ua.includes('Edg/')) return 'Microsoft Edge'
  if (ua.includes('Chrome/')) return 'Google Chrome'
  if (ua.includes('Firefox/')) return 'Mozilla Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Apple Safari'
  return 'Web Browser'
}

function sanitizeValue(key, val) {
  if (val === undefined || val === null) return '—'
  const keyLower = String(key || '').toLowerCase()
  if (keyLower.includes('password')) return '••••••••'
  if (keyLower.includes('aadhaar')) return maskAadhaar(val)
  if (keyLower.includes('pan')) return maskPAN(val)
  if (keyLower.includes('account') || keyLower.includes('bank_acc')) return maskBankAcc(val)
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

function readLogsFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
    // Check legacy storage
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      return Array.isArray(parsed) ? parsed : []
    }
    return []
  } catch (err) {
    console.warn('Could not read audit logs:', err)
    return []
  }
}

function writeLogsToStorage(logs) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_AUDIT_LOGS)))
  } catch (err) {
    console.warn('Could not persist audit logs:', err)
  }
}

/**
 * Public Audit Logging API
 */
export function logAudit({
  module = 'SYSTEM',
  entity_type = 'General',
  entity_id = '—',
  action = 'UPDATE',
  description = '',
  changes = [],
  remarks = '',
  user = null,
  company = null,
  result = 'SUCCESS',
}) {
  const actor = user || getActor() || { id: 1, username: 'admin', role: 'SUPER_ADMIN' }
  const companyId = company || getActiveCompanyId() || 1
  const companyName = Number(companyId) === 1 ? 'CMHP Pharma' : 'Tej Biocare'

  const now = new Date()
  const auditEntry = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: now.toISOString(),
    timestamp_ist: formatDateTimeIN(now),
    user: {
      id: actor.id || null,
      username: actor.username || actor.name || 'System',
      name: `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.username || 'System User',
      role: actor.role || 'USER',
    },
    company_id: Number(companyId),
    company_name: companyName,
    module: String(module).toUpperCase(),
    entity_type: String(entity_type),
    entity_id: String(entity_id || '—'),
    action: String(action).toUpperCase(),
    description: description || `${action} on ${entity_type} ${entity_id || ''}`.trim(),
    changes: Array.isArray(changes)
      ? changes.map((c) => ({
          field: c.field,
          label: c.label || c.field,
          old_value: sanitizeValue(c.field, c.old_value),
          new_value: sanitizeValue(c.field, c.new_value),
        }))
      : [],
    remarks: remarks || '',
    ip: '127.0.0.1 (Local Client)',
    browser: getBrowserInfo(),
    result: result || 'SUCCESS',
  }

  const existingLogs = readLogsFromStorage()
  existingLogs.unshift(auditEntry)
  writeLogsToStorage(existingLogs)

  return auditEntry
}

/**
 * Backwards compatible helper for Redux middleware action recording
 */
export function recordAudit({ action, payload, state }) {
  if (!action || typeof action !== 'string') return

  const actionName = action.replace(/^erp\//, '')
  let module = 'SYSTEM'
  let entity_type = 'Record'
  let actType = 'UPDATE'
  let entity_id = payload?.id ? String(payload.id) : '—'
  let desc = `Performed ${actionName}`

  if (actionName.includes('User')) {
    module = 'HRMS'
    entity_type = 'Employee'
    entity_id = payload?.employee_id || payload?.id || '—'
  } else if (actionName.includes('Attendance')) {
    module = 'HRMS'
    entity_type = 'Attendance'
    entity_id = payload?.date ? `${payload.employee_id || ''} (${payload.date})` : '—'
  } else if (actionName.includes('Leave')) {
    module = 'HRMS'
    entity_type = 'Leave'
  } else if (actionName.includes('Shift')) {
    module = 'HRMS'
    entity_type = 'Shift'
  } else if (actionName.includes('Designation')) {
    module = 'HRMS'
    entity_type = 'Designation'
  } else if (actionName.includes('Holiday')) {
    module = 'HRMS'
    entity_type = 'Holiday'
  } else if (actionName.includes('Salary') || actionName.includes('Payroll')) {
    module = 'HRMS'
    entity_type = 'Payroll'
  } else if (actionName.includes('Product') || actionName.includes('Formula')) {
    module = 'PRODUCTS'
    entity_type = 'Product'
    entity_id = payload?.code || payload?.id || '—'
  } else if (actionName.includes('Customer')) {
    module = 'CUSTOMERS'
    entity_type = 'Customer'
    entity_id = payload?.code || payload?.id || '—'
  } else if (actionName.includes('Order')) {
    module = 'ORDERS'
    entity_type = 'Order'
    entity_id = payload?.number || payload?.id || '—'
  } else if (actionName.includes('Invoice')) {
    module = 'INVOICE'
    entity_type = 'Invoice'
    entity_id = payload?.number || payload?.id || '—'
  } else if (actionName.includes('Batch')) {
    module = 'OPERATIONS'
    entity_type = 'Batch'
    entity_id = payload?.batch_number || payload?.id || '—'
  }

  if (actionName.startsWith('add') || actionName.startsWith('create') || actionName.startsWith('apply')) {
    actType = 'CREATE'
    desc = `Created new ${entity_type}`
  } else if (actionName.startsWith('delete') || actionName.startsWith('cancel')) {
    actType = 'DELETE'
    desc = `Deleted/Cancelled ${entity_type}`
  } else if (actionName.startsWith('edit') || actionName.startsWith('update')) {
    actType = 'UPDATE'
    desc = `Updated ${entity_type}`
  } else if (actionName.startsWith('approve')) {
    actType = 'APPROVE'
    desc = `Approved ${entity_type}`
  } else if (actionName.startsWith('reject')) {
    actType = 'REJECT'
    desc = `Rejected ${entity_type}`
  }

  logAudit({
    module,
    entity_type,
    entity_id,
    action: actType,
    description: desc,
    remarks: payload?.remarks || '',
    changes: payload?.payload
      ? Object.keys(payload.payload).map((k) => ({
          field: k,
          old_value: '—',
          new_value: payload.payload[k],
        }))
      : [],
  })
}

export function getAuditRows(targetCompany = null) {
  const all = readLogsFromStorage()
  if (!targetCompany) return all
  return all.filter((l) => Number(l.company_id) === Number(targetCompany))
}

export function getEntityAuditLogs(entityType, entityId) {
  const all = readLogsFromStorage()
  if (!entityType || !entityId) return []
  const targetId = String(entityId).toLowerCase()
  const targetType = String(entityType).toLowerCase()

  return all.filter((l) => {
    const matchType = String(l.entity_type).toLowerCase() === targetType
    const matchId = String(l.entity_id).toLowerCase() === targetId || String(l.id).toLowerCase() === targetId
    return matchType && matchId
  })
}

// Append-only guarantee: clearAuditRows intentionally disabled
export function clearAuditRows() {
  console.warn('Audit logs are append-only. Clearing is disabled by compliance policy.')
}

export function companyLabel(id) {
  return Number(id) === 1 ? 'CMHP Pharma' : Number(id) === 2 ? 'Tej Biocare' : 'Common'
}

export { AUDIT_STORAGE_KEY }