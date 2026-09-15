import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoHrOffice,
  canDoLoanOffice,
  isAccountsExecutiveRole,
  isAdminRole,
  normalizeRole,
} from "@/lib/loan-workflow"

const ALLOWED_ROLES = new Set([
  "accounts",
  "accounts_executive",
  "account_executive",
  "accounts_exec",
  "accounts_loan_office",
  "hr_loan_office",
  "hr_loan",
  "loan_office",
  "loan_officer",
  "hr_office",
  "manager_hr",
  "director_hr",
  "hr_executive",
  "loan_committee",
  "committee",
])

export async function GET() {
  try {
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, full_name, staff_number, position")
      .eq("id", user.id)
      .maybeSingle()
    const role = normalizeRole(profile?.role)
    const departmentName = String((profile as any)?.department_name || "")
    const departmentCode = String((profile as any)?.department_code || "")
    const canViewRunningLoans = Boolean(
      profile && (
        isAdminRole(role) ||
        ALLOWED_ROLES.has(role) ||
        canDoAccounts(role, departmentName, departmentCode) ||
        canDoLoanOffice(role, departmentName, departmentCode) ||
        canDoHrOffice(role, departmentName, departmentCode) ||
        isAccountsExecutiveRole(role) ||
        /admin|administrator/i.test(String(profile.position || ""))
      ),
    )
    if (!canViewRunningLoans) {
      return NextResponse.json({ error: "You are not authorized to view running loans" }, { status: 403 })
    }

    const { data: loans, error: loansError } = await admin
      .from("loan_requests")
      .select("*")
      // Start with All Loans, then keep only MD-approved loans with a confirmed disbursement.
      .in("status", ["partially_recovered", "active", "approved", "approved_director", "director_approved"])
      .order("created_at", { ascending: false })
    if (loansError) throw loansError

    const confirmedLoans = (loans || []).filter((loan: any) => {
      const mdApproved = ["approved", "approved_director", "director_approved"].includes(String(loan.status || "")) ||
        ["approved", "approved_director", "director_approved"].includes(String(loan.director_decision || "")) ||
        Boolean(loan.director_decision_at || loan.director_hr_id || loan.md_approved_at || loan.md_decided_at || loan.managing_director_id)
      const accountsConfirmed = Boolean(
        loan.accounts_confirmation ||
        loan.accounts_confirmed_at ||
        loan.accounts_reviewed_at ||
        loan.accounts_reviewer_id ||
        ["partially_recovered", "active"].includes(String(loan.status || "")),
      )
      return mdApproved && accountsConfirmed
    })
    const ids = confirmedLoans.map((loan) => loan.id)
    const staffIds = [...new Set(confirmedLoans.map((loan) => loan.staff_id || loan.user_id).filter(Boolean))]
    const [{ data: payments }, { data: schedules }, { data: staff }] = await Promise.all([
      ids.length ? admin.from("loan_payment_records").select("loan_request_id, amount_paid, overall_status, payment_date").in("loan_request_id", ids).eq("overall_status", "approved") : Promise.resolve({ data: [] }),
      ids.length ? admin.from("loan_repayment_schedule").select("loan_request_id, due_date, monthly_amount, paid_amount, status").in("loan_request_id", ids).order("due_date", { ascending: true }) : Promise.resolve({ data: [] }),
      staffIds.length ? admin.from("user_profiles").select("id, full_name, staff_number, department").in("id", staffIds) : Promise.resolve({ data: [] }),
    ])

    const staffMap = new Map((staff || []).map((person) => [person.id, person]))
    const paymentsByLoan = new Map<string, number>()
    for (const payment of payments || []) paymentsByLoan.set(payment.loan_request_id, (paymentsByLoan.get(payment.loan_request_id) || 0) + Number(payment.amount_paid || 0))
    const scheduleByLoan = new Map<string, any[]>()
    for (const item of schedules || []) scheduleByLoan.set(item.loan_request_id, [...(scheduleByLoan.get(item.loan_request_id) || []), item])

    const rows = confirmedLoans.map((loan) => {
      const total = Number(loan.fixed_amount || 0)
      const paidToDate = paymentsByLoan.get(loan.id) || 0
      const outstanding = Math.max(total - paidToDate, 0)
      const schedule = scheduleByLoan.get(loan.id) || []
      const remaining = schedule.filter((item) => item.status !== "paid" && item.status !== "waived")
      const completionDate = remaining.at(-1)?.due_date || schedule.at(-1)?.due_date || null
      const nextPayment = remaining[0] || null
      return {
        ...loan,
        staff: staffMap.get(loan.staff_id || loan.user_id) || null,
        total_amount: total,
        paid_to_date: paidToDate,
        outstanding_balance: outstanding,
        next_payment_due: nextPayment?.due_date || null,
        next_payment_amount: Number(nextPayment?.monthly_amount || 0),
        expected_completion_date: completionDate,
        repayment_status: outstanding <= 0 ? "completed" : remaining.some((item) => item.status === "overdue") ? "overdue" : "on_track",
      }
    }).filter((loan) => loan.outstanding_balance > 0)

    return NextResponse.json({ data: rows, generated_at: new Date().toISOString() })
  } catch (error) {
    console.error("[v0] running loans report error", error)
    return NextResponse.json({ error: "Failed to load running loans report" }, { status: 500 })
  }
}
