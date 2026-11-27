export function formulaQaStatus(revision) {
  switch (revision.status) {
    case 'SUBMITTED':
      return 'PENDING'
    case 'APPROVED':
      return 'APPROVED'
    case 'REJECTED':
      return 'DECLINED'
    case 'DRAFT':
      return revision.last_rejection_reason?.trim() ? 'DECLINED' : null
    default:
      return null
  }
}
