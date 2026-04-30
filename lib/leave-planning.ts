export type LeavePlanningRole =
  | "admin"
  | "regional_manager"
  | "department_head"
  | "staff"
  | "it-admin"
  | "nsp"
  | "intern"

export type LeavePlanStatus =
  | "pending_manager_review"
  | "manager_changes_requested"
  | "manager_rejected"
  | "manager_confirmed"
  | "hr_approved"
  | "hr_rejected"

export type LeavePlanReviewDecision = "pending" | "approved" | "recommend_change" | "rejected"

export function isStaffRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["staff", "it_admin", "nsp", "intern"].includes(normalized)
}

export function isManagerRole(role: string | null | undefined): boolean {
  const normalized = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_manager", "department_head"].includes(normalized)
}

export function isHrPlanningRole(role: string | null | undefined, departmentName?: string | null, departmentCode?: string | null): boolean {
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
  if (decisions.length === 0) return "pending_manager_review"
  if (decisions.some((d) => d === "rejected")) return "manager_rejected"
  if (decisions.some((d) => d === "recommend_change")) return "manager_changes_requested"
  if (decisions.every((d) => d === "approved")) return "manager_confirmed"
  return "pending_manager_review"
}
