export type LeavePlanningRole =
  | "admin"
  | "regional_manager"
  | "regional_hr_officer"
  | "department_head"
  | "staff"
  | "it-admin"
  | "nsp"
  | "intern"
  | "hr_leave_office"
  | "hr_records"
  | "hr_records_officer"
  | "hr_records_manager"
  | "hr_officer"
  | "hr"
  | "hr_director"
  | "director_hr"
  | "manager_hr"

// V2 statuses — old statuses kept for backward compat
export type LeavePlanStatus =
  // Legacy V1 statuses
  | "pending_manager_review"
  | "manager_changes_requested"
  | "manager_rejected"
  | "manager_confirmed"
  // V2 statuses
  | "pending_hod_review"
  | "hod_changes_requested"
  | "hod_rejected"
  | "hod_approved"
  | "pending_hr_records_reference"
  | "pending_hr_leave_processing"
  | "hr_office_forwarded"
  // Final statuses
  | "hr_approved"
  | "hr_rejected"
  // Regional pipeline statuses (staff -> Regional HR Office -> Regional Manager)
  | "pending_regional_hr_review"
  | "pending_regional_manager_approval"
  | "regional_changes_requested"
  | "regional_rejected"

export type LeavePlanReviewDecision = "pending" | "approved" | "recommend_change" | "rejected"

/** Statuses that require HOD/manager action */
export const HOD_PENDING_STATUSES: LeavePlanStatus[] = [
  "pending_hod_review",
  "pending_manager_review",
  // Regional Manager review reuses the same HOD-review UI and submitHodReview
  // flow — this status must be included here or the request renders read-only
  // under "Worked On Requests" with no Approve/Reject buttons.
  "pending_regional_manager_approval",
]

/** Statuses that require HR Leave Office action */
export const HR_OFFICE_PENDING_STATUSES: LeavePlanStatus[] = [
  "hod_approved",
  "hod_changes_requested", // HOD recommended date changes — HR Office can still forward with updated dates
  "pending_hr_leave_processing", // legacy/current status awaiting HR Leave Office processing
  "manager_confirmed", // legacy
]

/** Statuses that require HR Approver action */
export const HR_APPROVER_PENDING_STATUSES: LeavePlanStatus[] = [
  "hr_office_forwarded",
]

/** Statuses where leave is considered active/approved */
export const APPROVED_STATUSES: LeavePlanStatus[] = ["hr_approved"]

/** Statuses where request can still be edited/withdrawn by staff */
export const STAFF_EDITABLE_STATUSES: LeavePlanStatus[] = [
  "pending_hod_review",
  "pending_manager_review",
  "hod_changes_requested",
  "manager_changes_requested",
]

export function isStaffRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["staff", "it_admin", "nsp", "intern", "secretary"].includes(normalized)
}

/** HR Executives can also act as HOD for their department staff */
export function isHodRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_manager", "department_head", "director_hr", "manager_hr"].includes(normalized)
}

export function isManagerRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_manager", "department_head"].includes(normalized)
}

/** Regional HR Officer role — view-only access to regional leave data */
export function isRegionalHrOfficerRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_hr_officer", "regional_hr", "regional_hr_leave_office", "regional_leave_office"].includes(normalized)
}

export function isHrLeaveOfficeRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["hr_leave_office", "hr_office"].includes(normalized)
}

/** HR Approver role — issues final approval and PDF memo */
export function isHrApproverRole(role: string | null | undefined, departmentName?: string | null, departmentCode?: string | null): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return (
    normalized === "admin" ||
    normalized === "hr" ||
    normalized === "hr_officer" ||
    normalized === "hr_director" ||
    normalized === "director_hr" ||
    normalized === "manager_hr" ||
    (normalized === "department_head" && isHrDepartment(departmentName, departmentCode))
  )
}

/** Legacy alias — kept for backward compat */
export function isHrPlanningRole(role: string | null | undefined, departmentName?: string | null, departmentCode?: string | null): boolean {
  return isHrApproverRole(role, departmentName, departmentCode) || isHrLeaveOfficeRole(role)
}

export function isHrDepartment(departmentName?: string | null, departmentCode?: string | null): boolean {
  const name = (departmentName || "").toLowerCase()
  const code = (departmentCode || "").toLowerCase()
  return code === "hr" || name.includes("human resource") || name.includes("human resources") || name === "hr"
}

export function buildHologramCode(prefix: "USR" | "HR"): string {
  void prefix
  return "QCC-LOANLEAVE-APP"
}

export function calculateRequestedDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0
  }

  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

export function summarizeManagerReviewStatus(decisions: LeavePlanReviewDecision[]): LeavePlanStatus {
  if (decisions.length === 0) return "pending_hod_review"
  if (decisions.some((d) => d === "rejected")) return "hod_rejected"
  if (decisions.some((d) => d === "recommend_change")) return "hod_changes_requested"
  // Changed: Mark as approved if AT LEAST ONE reviewer has approved (not requiring all)
  // This handles cases where multiple reviewers are assigned but only one needs to approve
  if (decisions.some((d) => d === "approved")) return "hod_approved"
  return "pending_hod_review"
}

/** Returns a human-readable label for a leave status */
export function getStatusLabel(status: string, memoReferenceLocked?: boolean): string {
  // The non-regional pipeline runs HOD Review -> HR Leave Office -> HR
  // Executive -> HR Records (last). Once HR Executive approves, the request
  // is "hr_approved" but the memo stays locked until HR Records adds the
  // official reference — reflect that instead of implying it's fully done.
  if (status === "hr_approved" && !memoReferenceLocked) {
    return "Approved — Awaiting HR Records Reference for Memo"
  }
  const labels: Record<string, string> = {
    pending_hod_review: "Pending HOD Review",
    pending_regional_hr_review: "Pending Regional HR Office Review",
    pending_regional_manager_approval: "Pending Regional Manager Approval",
    pending_hr_records_reference: "Awaiting HR Records Memo Reference",
    pending_hr_leave_processing: "Awaiting HR Leave Office Adjustment",
    pending_manager_review: "Pending Manager Review",
    hod_changes_requested: "Changes Requested by HOD",
    manager_changes_requested: "Changes Requested",
    hod_rejected: "Rejected by HOD",
    manager_rejected: "Rejected by Manager",
    hod_approved: "HOD Approved — Awaiting HR Leave Office",
    manager_confirmed: "Manager Confirmed — Awaiting HR Leave Office",
    hr_office_forwarded: "Forwarded to HR Executive — Pending Final Approval",
    hr_approved: "Approved",
    hr_rejected: "Rejected by HR",
    approved: "Approved by Regional Manager",
  }
  return labels[status] || status
}

/** Returns color class for a leave status badge */
export function getStatusColor(status: string): string {
  if (status === "hr_approved" || status === "approved") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (status.includes("rejected")) return "bg-red-100 text-red-800 border-red-200"
  if (status.includes("changes_requested")) return "bg-amber-100 text-amber-800 border-amber-200"
  if (status === "hr_office_forwarded") return "bg-blue-100 text-blue-800 border-blue-200"
  if (status.includes("hod_approved") || status.includes("manager_confirmed")) return "bg-teal-100 text-teal-800 border-teal-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

/** Compute which stage number (1-4) a request is at */
export function getWorkflowStage(status: string): number {
  if (HOD_PENDING_STATUSES.includes(status as LeavePlanStatus)) return 2
  if (status === "hod_approved" || status === "manager_confirmed" || status === "pending_hr_records_reference") return 3
  if (status === "pending_hr_leave_processing" || status === "hr_office_forwarded") return 4
  if (status === "hr_approved" || status === "hr_rejected" || status === "approved") return 4
  return 1
}

export interface DateWithType {
  date: Date
  type: "weekend" | "holiday"
  name?: string
}

/**
 * Detects all weekends and holidays within a date range
 * @param startDate - Start of the leave period (YYYY-MM-DD)
 * @param endDate - End of the leave period (YYYY-MM-DD)
 * @param holidays - Array of holiday dates in YYYY-MM-DD format
 * @param holidayNames - Map of holiday dates to their names
 * @returns Array of dates with their type (weekend or holiday)
 */
export function getWeekendsAndHolidaysInRange(
  startDate: string,
  endDate: string,
  holidays: string[] = [],
  holidayNames: Record<string, string> = {}
): DateWithType[] {
  const result: DateWithType[] = []

  if (!startDate || !endDate) return result

  const start = new Date(startDate)
  const end = new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return result
  }

  // Normalize holiday dates for quick lookup
  const holidaySet = new Set(holidays.map((h) => h.split("T")[0]))

  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0]
    const dayOfWeek = current.getDay()

    // Check if weekend (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      result.push({
        date: new Date(current),
        type: "weekend",
      })
    } else if (holidaySet.has(dateStr)) {
      // Check if holiday
      result.push({
        date: new Date(current),
        type: "holiday",
        name: holidayNames[dateStr] || "Holiday",
      })
    }

    current.setDate(current.getDate() + 1)
  }

  return result
}

/**
 * Calculates working days (excluding weekends and holidays)
 * @param startDate - Start of the leave period (YYYY-MM-DD)
 * @param endDate - End of the leave period (YYYY-MM-DD)
 * @param holidays - Array of holiday dates in YYYY-MM-DD format
 * @returns Object with total days, weekends, holidays, and working days
 */
export function calculateWorkingDays(
  startDate: string,
  endDate: string,
  holidays: string[] = []
): { totalDays: number; weekendDays: number; holidayDays: number; workingDays: number } {
  const totalDays = calculateRequestedDays(startDate, endDate)
  const weekendHolidayItems = getWeekendsAndHolidaysInRange(startDate, endDate, holidays)

  const weekendDays = weekendHolidayItems.filter((item) => item.type === "weekend").length
  const holidayDays = weekendHolidayItems.filter((item) => item.type === "holiday").length
  const workingDays = Math.max(0, totalDays - weekendDays - holidayDays)

  return {
    totalDays,
    weekendDays,
    holidayDays,
    workingDays,
  }
}
