import { isLoanRepaymentOutstanding } from "@/lib/loan-clearance"

type LoanType = {
  loan_key: string
  loan_label?: string | null
  category?: string | null
}

type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string; conflict: Record<string, unknown> }

const REJECTED_STATUSES = new Set(["hod_rejected", "rejected_fd", "committee_rejected", "director_rejected", "cancelled", "withdrawn"])
const CONFIRMED_REPAYMENT_STATUSES = new Set(["completed", "fully_repaid", "repaid"])

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function isOfficiallyRepaid(loan: any, paymentRecords: any[], schedule: any[], override: any) {
  const approvedPaid = paymentRecords
    .filter((payment) => normalized(payment.overall_status) === "completed" && normalized(payment.accounts_approval_status) === "approved")
    .reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0)
  const outstanding = override?.outstanding_balance == null
    ? Number.isFinite(Number(loan.outstanding_balance))
      ? Number(loan.outstanding_balance)
      : Number(loan.fixed_amount || 0) - approvedPaid
    : Number(override.outstanding_balance)
  const hasZeroBalance = Number.isFinite(outstanding) && outstanding <= 0
  const scheduleComplete = schedule.length > 0 && schedule.every((item) => ["paid", "waived", "completed"].includes(normalized(item.status)))
  const paymentConfirmed = paymentRecords.some((payment) =>
    normalized(payment.overall_status) === "completed" && normalized(payment.accounts_approval_status) === "approved",
  )
  const repaymentConfirmed = CONFIRMED_REPAYMENT_STATUSES.has(normalized(loan.repayment_status))
  return hasZeroBalance && scheduleComplete && paymentConfirmed && repaymentConfirmed
}

export async function validateLoanApplicationEligibility(
  admin: any,
  input: { userId: string; loanType: LoanType; applicationYear?: number; excludeId?: string },
): Promise<EligibilityResult> {
  const year = input.applicationYear || new Date().getFullYear()
  const { data: requests, error } = await admin
    .from("loan_requests")
    .select("id, user_id, staff_id, status, loan_type_key, loan_type_label, repayment_status, created_at, md_approved_at, disbursement_date, fixed_amount, outstanding_balance")
    .or(`user_id.eq.${input.userId},staff_id.eq.${input.userId}`)
    .neq("id", input.excludeId || "00000000-0000-0000-0000-000000000000")
    .not("status", "in", `(${[...REJECTED_STATUSES].join(",")})`)
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!requests?.length) return { eligible: true }

  const keys = [...new Set(requests.map((row: any) => row.loan_type_key).filter(Boolean))]
  const ids = requests.map((row: any) => row.id)
  const [{ data: types, error: typesError }, { data: payments }, { data: schedules }, { data: overrides }] = await Promise.all([
    admin.from("loan_types").select("loan_key, loan_label, category").in("loan_key", keys),
    admin.from("loan_payment_records").select("loan_request_id, overall_status, accounts_approval_status").in("loan_request_id", ids),
    admin.from("loan_repayment_schedule").select("loan_request_id, status").in("loan_request_id", ids),
    admin.from("loan_admin_operational_overrides").select("loan_request_id, outstanding_balance").in("loan_request_id", ids),
  ])
  if (typesError) throw typesError

  const typeByKey = new Map((types || []).map((type: any) => [type.loan_key, type]))
  const targetType = typeByKey.get(input.loanType.loan_key) || input.loanType
  const targetGroup = normalized(targetType.category || targetType.loan_key)
  const paymentsByLoan = new Map<string, any[]>()
  const schedulesByLoan = new Map<string, any[]>()
  const overrideByLoan = new Map((overrides || []).map((item: any) => [item.loan_request_id, item]))
  for (const payment of payments || []) paymentsByLoan.set(payment.loan_request_id, [...(paymentsByLoan.get(payment.loan_request_id) || []), payment])
  for (const item of schedules || []) schedulesByLoan.set(item.loan_request_id, [...(schedulesByLoan.get(item.loan_request_id) || []), item])

  for (const loan of requests) {
    const type = typeByKey.get(loan.loan_type_key) || { loan_key: loan.loan_type_key, loan_label: loan.loan_type_label, category: loan.loan_type_key }
    const sameType = normalized(type.loan_key) === normalized(targetType.loan_key)
    const sameGroup = normalized(type.category || type.loan_key) === targetGroup
    if (!sameType && !sameGroup) continue

    const officiallyRepaid = isOfficiallyRepaid(loan, paymentsByLoan.get(loan.id) || [], schedulesByLoan.get(loan.id) || [], overrideByLoan.get(loan.id))
    if (officiallyRepaid) continue

    const sameYear = String(loan.created_at || "").startsWith(String(year))
    const runningLoan = Boolean(loan.md_approved_at && loan.disbursement_date) || isLoanRepaymentOutstanding(loan)
    const label = type.category || type.loan_label || type.loan_key
    if (sameType && sameYear) {
      return { eligible: false, reason: `Application declined. You have already applied for this loan type within the current year and are not currently eligible to apply again.`, conflict: { loanId: loan.id, loanType: type.loan_label || type.loan_key } }
    }
    if (runningLoan || sameGroup) {
      return { eligible: false, reason: `Application declined. You already have an active or unconfirmed loan under the ${label} category. You must fully repay the existing loan and have the repayment confirmed before applying for another loan in this category.`, conflict: { loanId: loan.id, category: label, loanType: type.loan_label || type.loan_key } }
    }
  }

  return { eligible: true }
}
