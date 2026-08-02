/**
 * Calculate days overdue since leave ended
 */
export function getDaysOverdue(leaveEndDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const endDate = new Date(leaveEndDate)
  endDate.setHours(0, 0, 0, 0)
  
  const diffTime = today.getTime() - endDate.getTime()
  const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  return daysOverdue > 0 ? daysOverdue : 0
}

/**
 * Get row highlight class based on resumption status with escalating color intensity
 * Day 0-1: No color
 * Day 2-3: Light red (red-100)
 * Day 4-5: Red-200
 * Day 6-7: Red-300
 * Day 8-9: Red-400
 * Day 10+: Deep red-600 (dismissal/queries phase)
 */
export function getResumptionRowClass(
  leaveEndDate: string,
  confirmationStatus: string | null,
  staffConfirmed: boolean = false,
  hodConfirmed: boolean = false
): string {
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date(leaveEndDate).toISOString().split('T')[0]
  const leaveHasEnded = today > endDate

  // No highlighting if leave hasn't ended
  if (!leaveHasEnded) return ''

  // No highlighting if confirmed
  if (confirmationStatus === 'confirmed' || (staffConfirmed && hodConfirmed)) return ''

  // Calculate days overdue
  const daysOverdue = getDaysOverdue(leaveEndDate)

  // Not yet overdue (within 1 day)
  if (daysOverdue <= 1) return ''

  // Apply escalating red color intensity based on days overdue
  if (daysOverdue >= 10) {
    return 'bg-red-600 hover:bg-red-700 transition-colors text-white'
  } else if (daysOverdue >= 8) {
    return 'bg-red-500 hover:bg-red-600 transition-colors'
  } else if (daysOverdue >= 6) {
    return 'bg-red-400 hover:bg-red-500 transition-colors'
  } else if (daysOverdue >= 4) {
    return 'bg-red-300 hover:bg-red-400 transition-colors'
  } else if (daysOverdue >= 2) {
    return 'bg-red-200 hover:bg-red-300 transition-colors'
  }

  return ''
}
