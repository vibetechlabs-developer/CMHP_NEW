/**
 * QC Release Gate for warehouse receipt lots.
 * Display still uses a local cache for snappy UI; updates also persist to
 * /api/v1/stores/:id/stock-movements/:movementId/quality-status/ so issue
 * posting excludes quarantine / on-hold / rejected lots.
 */
import { setLotQualityStatus } from '../store/materialIssueService'

const QC_STORAGE_KEY = 'cmhp_qc_lot_statuses_v1'

function getStoredQcMap() {
  try {
    const raw = localStorage.getItem(QC_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

function saveStoredQcMap(map) {
  try {
    localStorage.setItem(QC_STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.warn('[qualityStatusService] Failed to persist QC statuses:', e)
  }
}

export const qualityStatusService = {
  getLotStatus: (movementId, defaultIfUnset = null) => {
    const map = getStoredQcMap()
    const idKey = String(movementId)
    if (map[idKey]) return map[idKey]
    if (defaultIfUnset) return defaultIfUnset
    // Default: approved / issue-eligible until explicitly quarantined.
    return {
      status: 'APPROVED',
      arNo: '',
      chemist: '',
      releasedAt: null,
      remarks: 'No explicit QC decision recorded — treated as issue-eligible.',
    }
  },

  updateLotStatus: async (movementId, { status, arNo, chemist, remarks, storeId } = {}) => {
    const map = getStoredQcMap()
    const idKey = String(movementId)
    const existing = map[idKey] || {}
    const updated = {
      ...existing,
      status: status || existing.status || 'APPROVED',
      arNo: arNo !== undefined ? arNo : (existing.arNo || ''),
      chemist: chemist || existing.chemist || 'QC Chemist In-Charge',
      remarks: remarks || existing.remarks || '',
      updatedAt: new Date().toISOString(),
      releasedAt: status === 'APPROVED' ? new Date().toISOString().split('T')[0] : null,
    }
    map[idKey] = updated
    saveStoredQcMap(map)

    if (storeId) {
      await setLotQualityStatus(storeId, movementId, {
        status: updated.status,
        arNo: updated.arNo,
        chemist: updated.chemist,
        remarks: updated.remarks,
      })
    }
    return updated
  },

  computeQualityMetrics: (movementsList = []) => {
    let approved = 0
    let underTest = 0
    let rejected = 0
    let onHold = 0

    movementsList.forEach((mov) => {
      const q = qualityStatusService.getLotStatus(mov.id)
      if (q.status === 'APPROVED') approved++
      else if (q.status === 'UNDER_TEST') underTest++
      else if (q.status === 'REJECTED') rejected++
      else if (q.status === 'ON_HOLD') onHold++
      else approved++
    })

    return {
      approved,
      underTest,
      rejected,
      onHold,
      totalTracked: movementsList.length,
    }
  },
}
