export type LeavePlanningRole =
  | "admin"
  | "regional_manager"
  | "department_head"
  | "staff"
  | "it-admin"
  | "nsp"
  | "intern"
  | "hr_leave_office"
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
  | "hr_office_forwarded"
  // Final statuses
  | "hr_approved"
  | "hr_rejected"

export type LeavePlanReviewDecision = "pending" | "approved" | "recommend_change" | "rejected"

/** Statuses that require HOD/manager action */
export const HOD_PENDING_STATUSES: LeavePlanStatus[] = [
  "pending_hod_review",
  "pending_manager_review",
]

/** Statuses that require HR Leave Office action */
export const HR_OFFICE_PENDING_STATUSES: LeavePlanStatus[] = [
  "hod_approved",
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
  return ["staff", "it_admin", "nsp", "intern"].includes(normalized)
}

export function isManagerRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_manager", "department_head"].includes(normalized)
}

/** HR Leave Office role — receives HOD-approved leaves, can adjust days/dates, forwards to HR Approver */
export function isHrLeaveOfficeRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return normalized === "hr_leave_office"
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
  return "QCC-LOAN-APP"
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
  if (decisions.every((d) => d === "approved")) return "hod_approved"
  return "pending_hod_review"
}

/** Returns a human-readable label for a leave status */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_hod_review: "Pending HOD Review",
    pending_manager_review: "Pending Manager Review",
    hod_changes_requested: "Changes Requested by HOD",
    manager_changes_requested: "Changes Requested",
    hod_rejected: "Rejected by HOD",
    manager_rejected: "Rejected by Manager",
    hod_approved: "HOD Approved — Awaiting HR Office",
    manager_confirmed: "Manager Confirmed — Awaiting HR Office",
    hr_office_forwarded: "HR Office Reviewed — Awaiting HR Approval",
    hr_approved: "Approved",
    hr_rejected: "Rejected by HR",
  }
  return labels[status] || status
}

/** Returns color class for a leave status badge */
export function getStatusColor(status: string): string {
  if (status === "hr_approved") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (status.includes("rejected")) return "bg-red-100 text-red-800 border-red-200"
  if (status.includes("changes_requested")) return "bg-amber-100 text-amber-800 border-amber-200"
  if (status === "hr_office_forwarded") return "bg-blue-100 text-blue-800 border-blue-200"
  if (status.includes("hod_approved") || status.includes("manager_confirmed")) return "bg-teal-100 text-teal-800 border-teal-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

/** Compute which stage number (1-4) a request is at */
export function getWorkflowStage(status: string): number {
  if (HOD_PENDING_STATUSES.includes(status as LeavePlanStatus)) return 2
  if (status === "hod_approved" || status === "manager_confirmed") return 3
  if (status === "hr_office_forwarded") return 4
  if (status === "hr_approved" || status === "hr_rejected") return 4
  return 1
}
