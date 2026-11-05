import api from '../../api/axios'
import { storage } from '../../utils/storage'
import { getScopedCompanyId, isSuperAdmin, getLockedCompanyIds } from '../../utils/companyScope'

const DB_NAME = 'cmhp_bmr_database'
const DB_VERSION = 1
const STORE_NAME = 'bmr_records'
const LS_FALLBACK_KEY = 'cmhp_bmr_db_records_v1'

function getActiveCompanyId() {
  const user = storage.getUser()
  if (isSuperAdmin(user)) {
    return getScopedCompanyId(user)
  }
  const locked = getLockedCompanyIds(user)
  const primaryCompany = Number(locked?.[0])
  if (Number.isFinite(primaryCompany) && primaryCompany > 0) {
    return primaryCompany
  }
  return getScopedCompanyId(user)
}

/**
 * Open or create the client IndexedDB database
 */
function openIndexedDb() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('orderId', 'orderId', { unique: false })
          store.createIndex('batchNo', 'batchNo', { unique: false })
          store.createIndex('bmrType', 'bmrType', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('CMHP BMR IndexedDB open error, falling back to storage')
        resolve(null)
      }
    } catch (err) {
      console.warn('CMHP BMR IndexedDB failed:', err)
      resolve(null)
    }
  })
}

/**
 * Read from LocalStorage fallback DB
 */
function getFromLocalStorageDb(key) {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.[key] || null
  } catch {
    return null
  }
}

/**
 * Save to LocalStorage fallback DB
 */
function saveToLocalStorageDb(key, record) {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    existing[key] = record
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(existing))
  } catch (err) {
    console.warn('CMHP BMR LocalStorage DB save error:', err)
  }
}

export const bmrDbService = {
  /**
   * Get BMR from database (tries Backend Django PostgreSQL first, then IndexedDB, then LocalStorage)
   */
  getBmr: async (orderId, batchNo, bmrType = 'drops') => {
    const type = (bmrType || 'drops').toLowerCase()
    const orderKey = orderId ? String(orderId) : null
    const batchKey = batchNo ? String(batchNo) : null
    const primaryKey = orderKey ? `${type}_${orderKey}` : (batchKey ? `${type}_${batchKey}` : null)

    // 1. Try Backend Django PostgreSQL Database
    try {
      const companyId = getActiveCompanyId()
      const url = companyId
        ? `/v1/companies/${companyId}/bmr-documents/`
        : `/v1/bmr/bmr-documents/`

      const res = await api.get(url, {
        params: {
          orderId: orderKey,
          batchNo: batchKey,
          type,
        },
      })

      if (res?.data?.found && res?.data?.data) {
        const docData = res.data.data
        // Cache in local DB
        if (primaryKey) {
          bmrDbService.saveToLocalDb(primaryKey, {
            key: primaryKey,
            orderId: orderKey,
            batchNo: batchKey,
            bmrType: type,
            data: docData,
            updatedAt: new Date().toISOString(),
          })
        }
        return docData
      }
    } catch {
      // Backend request failed or offline, fall back to persistent browser DB
    }

    // 2. Try Browser IndexedDB Database
    if (primaryKey) {
      try {
        const db = await openIndexedDb()
        if (db) {
          const idbData = await new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], 'readonly')
            const store = tx.objectStore(STORE_NAME)
            const req = store.get(primaryKey)
            req.onsuccess = () => resolve(req.result?.data || null)
            req.onerror = () => resolve(null)
          })
          if (idbData) {
            return idbData
          }
        }
      } catch (err) {
        console.warn('Failed reading from IndexedDB:', err)
      }

      // 3. Try LocalStorage DB Fallback
      const lsRecord = getFromLocalStorageDb(primaryKey)
      if (lsRecord?.data) {
        return lsRecord.data
      }
    }

    return null
  },

  /**
   * Save BMR to database (writes to Backend Django PostgreSQL, IndexedDB, and LocalStorage)
   */
  saveBmr: async (payload) => {
    const { orderId, batchNo, bmrType = 'drops', data, isDraft = true } = payload || {}
    const type = (bmrType || data?.bmrType || 'drops').toLowerCase()
    const orderKey = orderId ? String(orderId) : null
    const batchKey = batchNo ? String(batchNo) : null
    const primaryKey = orderKey ? `${type}_${orderKey}` : (batchKey ? `${type}_${batchKey}` : `${type}_default`)

    const record = {
      key: primaryKey,
      orderId: orderKey,
      batchNo: batchKey,
      bmrType: type,
      data,
      isDraft: Boolean(isDraft),
      updatedAt: new Date().toISOString(),
    }

    // 1. Save to Browser IndexedDB Database
    try {
      const db = await openIndexedDb()
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readwrite')
          const store = tx.objectStore(STORE_NAME)
          store.put(record)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }
    } catch (err) {
      console.warn('IndexedDB save failed:', err)
    }

    // 2. Save to LocalStorage DB Fallback
    saveToLocalStorageDb(primaryKey, record)
    if (orderKey) saveToLocalStorageDb(`${type}_${orderKey}`, record)
    if (batchKey) saveToLocalStorageDb(`${type}_${batchKey}`, record)

    // 3. Save to Backend Django PostgreSQL Database
    let backendSuccess = false
    try {
      const companyId = getActiveCompanyId()
      const url = companyId
        ? `/v1/companies/${companyId}/bmr-documents/`
        : `/v1/bmr/bmr-documents/`

      await api.post(url, {
        orderId: orderKey,
        batchNo: batchKey,
        bmrType: type,
        data,
        isDraft: Boolean(isDraft),
      })
      backendSuccess = true
    } catch (err) {
      // Backend may be offline or unreachable on standalone client
      console.warn('Backend DB save notice (persisted in local DB):', err?.message)
    }

    return {
      success: true,
      savedAt: record.updatedAt,
      backendPersisted: backendSuccess,
      databasePersisted: true,
    }
  },

  /**
   * Helper to write to IndexedDB and LocalStorage directly
   */
  saveToLocalDb: async (key, record) => {
    try {
      saveToLocalStorageDb(key, record)
      const db = await openIndexedDb()
      if (db) {
        const tx = db.transaction([STORE_NAME], 'readwrite')
        tx.objectStore(STORE_NAME).put(record)
      }
    } catch (err) {
      console.warn('saveToLocalDb error:', err)
    }
  },
}
