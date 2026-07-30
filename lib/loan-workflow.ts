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
  // Managing Director final stamp — set when md_approved_at is populated
  | "md_final_approved"

export const GOOD_FD_THRESHOLD = 39

/**
 * Funeral, Insurance, and Repair loans are FD-exempt:
 * they proceed to HR Loan Office as long as FD score >= 0.
 * They must NEVER receive a rejection memo for sub-threshold FD.
 */
export function isFdExemptLoanType(loanTypeKey: string | null | undefined, loanTypeLabel?: string | null): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const label = String(loanTypeLabel || "").toLowerCase()
  const EXEMPT = /funeral|repair|insurance/
  return EXEMPT.test(key) || EXEMPT.test(label)
}

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

const ADMIN_ROLE_ALIASES = new Set(["admin", "super_admin", "god"])
// Note: it_admin is NOT included - IT Admin users should only see My Loans and My Tasks tabs
// They are not system administrators for loan workflow purposes

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLE_ALIASES.has(normalizeRole(role))
}

export function isMdRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "managing_director"
}

export function isSecretaryRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "secretary"
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
  return isAdminRole(role) || ["regional_manager", "department_head"].includes(role)
}

export function canDoLoanOffice(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return isAdminRole(role) || role === "loan_officer" || role === "loan_office" || role === "manager_hr" || isLoanOfficeDepartment(deptName, deptCode)
}

export function canDoAccounts(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  const normalizedRole = normalizeRole(role)
  return (
    isAdminRole(normalizedRole) ||
    normalizedRole === "accounts" ||
    normalizedRole === "accounts_executive" ||
    normalizedRole.includes("account") ||
    isAccountsDepartment(deptName, deptCode)
  )
}

export function canDoCommittee(role: string): boolean {
  return isAdminRole(role) || role === "loan_committee" || role === "committee_member" || role === "committee" || role === "director_hr" || role === "manager_hr"
}

export function canDoHrOffice(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return isAdminRole(role) || role === "hr_officer" || role === "manager_hr" || role === "loan_office" || isHrDepartment(deptName, deptCode)
}

export function canDoDirectorHr(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  // Includes hr_executive, hr, manager_hr, director_hr, hr_director roles so all HR Executive-level
  // users can access the Executive HR approval queue and sign memos
  return (
    isAdminRole(role) ||
    role === "director_hr" ||
    role === "manager_hr" ||
    role === "hr_director" ||
    role === "hr_executive" ||
    role === "hr" ||
    role === "hr_manager" ||
    (role === "department_head" && isHrDepartment(deptName, deptCode))
  )
}

export function requestIsEditable(status: string): boolean {
  return ["pending_hod", "hod_rejected"].includes(status)
}
