export interface LeaveTypePolicy {
  leaveTypeKey: string
  leaveTypeLabel: string
  entitlementDays: number
  leaveYearPeriod: string
  isEnabled: boolean
}

export interface LeavePolicyPayload {
  activePeriod: string
  periods: { value: string; label: string; active: boolean }[]
  leaveTypes: LeaveTypePolicy[]
}

export const DEFAULT_LEAVE_TYPES: LeaveTypePolicy[] = [
  { leaveTypeKey: "annual", leaveTypeLabel: "Annual Leave", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "sick", leaveTypeLabel: "Sick Leave", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "maternity", leaveTypeLabel: "Maternity Leave", entitlementDays: 84, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "paternity", leaveTypeLabel: "Paternity Leave", entitlementDays: 5, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "study_with_pay", leaveTypeLabel: "Study Leave (With Pay)", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "study_without_pay", leaveTypeLabel: "Study Leave (Without Pay)", entitlementDays: 180, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "casual", leaveTypeLabel: "Casual Leave", entitlementDays: 10, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "part_leave", leaveTypeLabel: "Part Leave", entitlementDays: 15, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "compassionate", leaveTypeLabel: "Compassionate Leave", entitlementDays: 7, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "special_unpaid", leaveTypeLabel: "Special / Leave Without Pay", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
]

export function getLeaveYearPeriods(baseYear = 2026, years = 10) {
  const periods: { value: string; label: string; active: boolean }[] = []
  for (let i = 0; i < years; i++) {
    const start = baseYear + i
    const end = start + 1
    const label = `${start}/${end}`
    periods.push({ value: label, label, active: i === 0 })
  }
  return periods
}

export function computeLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  
  // Calculate working days (exclude weekends - Saturday=6, Sunday=0)
  let workingDays = 0
  const current = new Date(start)
  
  while (current <= end) {
    const dayOfWeek = current.getDay()
    // Only count Monday (1) to Friday (5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDays++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return workingDays
}

export function computeReturnToWorkDate(endDate: string): string {
  const date = new Date(endDate)
  if (Number.isNaN(date.getTime())) return "N/A"
  date.setDate(date.getDate() + 1)
  return date.toISOString().split("T")[0]
}
