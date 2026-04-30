export type LoanWorkflowStatus =
  | "pending_hod"
  | "hod_approved"
  | "hod_rejected"
  | "sent_to_accounts"
  | "rejected_fd"
  | "awaiting_committee"
  | "committee_rejected"
  | "awaiting_hr_terms"
  | "awaiting_director_hr"
  | "approved_director"
  | "director_rejected"

export const GOOD_FD_THRESHOLD = 39

export const SCHEMA_MISSING_CODES = new Set(["PGRST200", "PGRST204", "PGRST205", "42P01", "42703"])

export function isSchemaIssue(error: any): boolean {
  if (!error) return false
  const code = String(error.code || "")
  const msg = String(error.message || error.details || "")
  if (SCHEMA_MISSING_CODES.has(code)) return true
  return /schema cache|does not exist|relationship/i.test(msg)
}

export function normalizeRole(role: string | null | undefined): string {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

export function isHrDepartment(name?: string | null, code?: string | null): boolean {
  const n = String(name || "").toLowerCase()
  const c = String(code || "").toLowerCase()
  return n.includes("human") || n.includes("hr") || c.includes("hr")
}

export function isAccountsDepartment(name?: string | null, code?: string | null): boolean {
  const n = String(name || "").toLowerCase()
  const c = String(code || "").toLowerCase()
  return n.includes("account") || n.includes("finance") || c.includes("acc") || c.includes("fin")
}

export function isLoanOfficeDepartment(name?: string | null, code?: string | null): boolean {
  const n = String(name || "").toLowerCase()
  const c = String(code || "").toLowerCase()
  return n.includes("loan") || c.includes("loan") || n.includes("welfare")
}

export function canDoHodReview(role: string): boolean {
  return ["admin", "regional_manager", "department_head"].includes(role)
}

export function canDoLoanOffice(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return role === "admin" || role === "loan_officer" || role === "loan_office" || role === "manager_hr" || isLoanOfficeDepartment(deptName, deptCode)
}

export function canDoAccounts(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  const normalizedRole = String(role || "").toLowerCase()
  return normalizedRole === "admin" || normalizedRole === "accounts" || normalizedRole.includes("account") || isAccountsDepartment(deptName, deptCode)
}

export function canDoCommittee(role: string): boolean {
  return role === "admin" || role === "loan_committee" || role === "committee_member" || role === "committee" || role === "director_hr" || role === "manager_hr"
}

export function canDoHrOffice(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return role === "admin" || role === "hr_officer" || role === "manager_hr" || role === "loan_office" || isHrDepartment(deptName, deptCode)
}

export function canDoDirectorHr(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return role === "admin" || role === "director_hr" || role === "manager_hr" || role === "hr_director" || (role === "department_head" && isHrDepartment(deptName, deptCode))
}

export function requestIsEditable(status: string): boolean {
  return ["pending_hod", "hod_rejected"].includes(status)
}
