/**
 * Get row highlight class based on resumption status
 * Light red for overdue non-confirmations
 */
export function getResumptionRowClass(
  leaveEndDate: string,
  confirmationStatus: string | null,
  isOverdue: boolean
): string {
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date(leaveEndDate).toISOString().split('T')[0]
  const leaveHasEnded = today > endDate

  if (!leaveHasEnded) return ''
  if (!confirmationStatus || confirmationStatus === 'confirmed') return ''

  // Light red for pending or unconfirmed resumptions
  if (confirmationStatus === 'pending_hod_rm' || confirmationStatus === 'unconfirmed' || confirmationStatus === 'pending_hr_manual') {
    return 'bg-red-50 hover:bg-red-100 transition-colors'
  }

  return ''
}
