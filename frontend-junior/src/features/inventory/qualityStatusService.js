import { setLotQualityStatus } from '../store/materialIssueService'

const STATUS_LABELS = {
  APPROVED: 'Released',
  REJECTED: 'Rejected',
  ON_HOLD: 'On Hold',
  UNDER_TEST: 'Quarantine',
}

export const qualityStatusService = {
  getLotStatus(movement) {
    const status = movement.quality_status || 'UNDER_TEST'
    return {
      status,
      label: STATUS_LABELS[status] || STATUS_LABELS.UNDER_TEST,
      arNo: movement.quality_ar_no || '',
      chemist: movement.quality_chemist || '',
      remarks: movement.quality_remarks || '',
    }
  },

  computeQualityMetrics(movements) {
    const counts = { APPROVED: 0, REJECTED: 0, ON_HOLD: 0, UNDER_TEST: 0 }
    movements.forEach((movement) => {
      const { status } = qualityStatusService.getLotStatus(movement)
      if (Object.hasOwn(counts, status)) counts[status]++
    })
    return {
      approved: counts.APPROVED,
      rejected: counts.REJECTED,
      onHold: counts.ON_HOLD,
      underTest: counts.UNDER_TEST,
    }
  },

  updateLotStatus(movementId, { storeId, ...decision }) {
    return setLotQualityStatus(storeId, movementId, decision)
  },
}
