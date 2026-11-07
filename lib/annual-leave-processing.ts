export function isAnnualLeaveType(value: string | null | undefined) {
  return ["annual", "annual_leave", "annual leave"].includes(String(value || "").trim().toLowerCase())
}

/** Annual leave becomes actionable on the first day of the month before leave starts. */
export function annualLeaveProcessingOpensAt(startDate: string | null | undefined) {
  const value = String(startDate || "")
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (!match) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null
  return new Date(year, monthIndex - 1, 1)
}

export function isAnnualLeaveProcessingOpen(startDate: string | null | undefined, now = new Date()) {
  const opensAt = annualLeaveProcessingOpensAt(startDate)
  return Boolean(opensAt && now >= opensAt)
}

export function annualLeaveProcessingReminderAt(startDate: string | null | undefined) {
  const opensAt = annualLeaveProcessingOpensAt(startDate)
  if (!opensAt) return null
  const reminder = new Date(opensAt)
  reminder.setDate(reminder.getDate() - 14)
  return reminder
}
