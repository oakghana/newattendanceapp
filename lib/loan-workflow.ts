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

/**
 * Acceptable FD threshold (percent of net-to-gross).
 * Scores at or above this value are acceptable and must never be auto-rejected.
 * Example: 39%, 42%, 49% are all reviewable / approvable.
 */
export const GOOD_FD_THRESHOLD = 39

/**
 * Funeral, Insurance, and any Repair loans (incl. vehicle repair) are FD-exempt:
 * Accounts Loan Office / Accounts Executive must not reject them for low FD.
 * They remain reviewable and should be pushed forward.
 */
export function isFdExemptLoanType(loanTypeKey: string | null | undefined, loanTypeLabel?: string | null): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const label = String(loanTypeLabel || "").toLowerCase()
  // "repair" covers vehicle repair, car repair, etc.
  const EXEMPT = /funeral|repair|insurance/
  return EXEMPT.test(key) || EXEMPT.test(label)
}

/** Coerce FD score from number | string safely. */
export function coerceFdScore(score: number | string | null | undefined): number | null {
  if (typeof score === "number" && Number.isFinite(score)) return score
  if (score == null || score === "") return null
  const n = Number(score)
  return Number.isFinite(n) ? n : null
}

/**
 * True when score is below the acceptable FD threshold (poor).
 * Numeric score is authoritative — ignores stale fd_good flags.
 */
export function isPoorFdScore(
  score: number | string | null | undefined,
  fdGood?: boolean | null,
): boolean {
  const n = coerceFdScore(score)
  if (n != null) return n < GOOD_FD_THRESHOLD
  return fdGood === false
}

/**
 * Whether Accounts may reject this FD on score grounds.
 * Exempt types (funeral / insurance / repairs) are never rejectable for FD.
 * Non-exempt types with score >= GOOD_FD_THRESHOLD are never rejectable.
 */
export function canRejectFdByScore(
  score: number | string | null | undefined,
  loanTypeKeyOrLabel?: string | null,
  fdGood?: boolean | null,
  loanTypeLabel?: string | null,
): boolean {
  if (isFdExemptLoanType(loanTypeKeyOrLabel, loanTypeLabel ?? loanTypeKeyOrLabel)) return false
  return isPoorFdScore(score, fdGood)
}

/** Format FD score/value as a percent string (never currency). */
export function formatFdPercent(score: number | string | null | undefined): string {
  const n = coerceFdScore(score)
  if (n == null) return "N/A"
  return `${Math.round(n)}%`
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
  const normalizedRole = normalizeRole(role)
  // Support both new (hr_loan_office) and legacy (loan_office) role names
  return isAdminRole(normalizedRole) || 
         normalizedRole === "loan_officer" || 
         normalizedRole === "loan_office" ||
         normalizedRole === "hr_loan_office" ||
         normalizedRole === "manager_hr" || 
         isLoanOfficeDepartment(deptName, deptCode)
}

export function canDoAccounts(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  const normalizedRole = normalizeRole(role)
  return (
    isAdminRole(normalizedRole) ||
    normalizedRole === "accounts" ||
    normalizedRole === "accounts_executive" ||
    normalizedRole === "accounts_loan_office" ||  // New department-specific role
    normalizedRole.includes("account") ||
    isAccountsDepartment(deptName, deptCode)
  )
}

export function canDoCommittee(role: string): boolean {
  return isAdminRole(role) || role === "loan_committee" || role === "committee_member" || role === "committee" || role === "director_hr" || role === "manager_hr"
}

export function canDoHrOffice(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  const nr = normalizeRole(role)
  return isAdminRole(nr) || nr === "hr_officer" || nr === "manager_hr" || nr === "loan_office" || nr === "hr_loan_office" || isHrDepartment(deptName, deptCode)
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
