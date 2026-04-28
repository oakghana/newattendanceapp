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
  { leaveTypeKey: "sick", leaveTypeLabel: "Sick Leave", entitlementDays: 14, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "maternity", leaveTypeLabel: "Maternity Leave", entitlementDays: 90, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "paternity", leaveTypeLabel: "Paternity Leave", entitlementDays: 14, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "unpaid", leaveTypeLabel: "Unpaid Leave", entitlementDays: 15, leaveYearPeriod: "2026/2027", isEnabled: true },
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
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export function computeReturnToWorkDate(endDate: string): string {
  const date = new Date(endDate)
  date.setDate(date.getDate() + 1)
  return date.toISOString().split("T")[0]
}
