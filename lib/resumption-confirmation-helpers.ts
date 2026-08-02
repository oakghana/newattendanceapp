/**
 * Calculate how many days have passed since the leave end date.
 * Returns 0 if leave has not ended yet.
 */
export function getDaysOverdue(leaveEndDate: string): number {
  if (!leaveEndDate) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(leaveEndDate)
  endDate.setHours(0, 0, 0, 0)
  const diffTime = today.getTime() - endDate.getTime()
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return days > 0 ? days : 0
}

/**
 * Get the Tailwind row background class for a leave request based on how many
 * days have passed since the leave end date, when the staff member has not yet
 * been confirmed as having resumed.
 *
 * Rules:
 *   - Leave not ended yet           → no colour
 *   - Both confirmed                → no colour
 *   - 1-4 days overdue              → amber / orange (warning)
 *   - 5+ days overdue               → red (urgent / dismissal risk)
 */
export function getResumptionRowClass(
  leaveEndDate: string,
  staffConfirmed: boolean,
  hodConfirmed: boolean
): string {
  if (!leaveEndDate) return ''

  const daysOverdue = getDaysOverdue(leaveEndDate)

  // Leave hasn't ended yet
  if (daysOverdue === 0) return ''

  // Both staff and HOD have confirmed — all good
  if (staffConfirmed && hodConfirmed) return ''

  if (daysOverdue >= 5) {
    // 5+ days overdue: escalating red
    return 'bg-red-100 hover:bg-red-200'
  }

  // 1-4 days overdue: amber warning
  return 'bg-amber-50 hover:bg-amber-100'
}
