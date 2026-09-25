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

const RUNNING_LOAN_STATUSES = [
  "hod_approved",
  "sent_to_accounts",
  "approved_director",
  "awaiting_committee",
  "awaiting_hr_terms",
  "awaiting_director_hr",
  "staff_receiving_funds",
  "partially_recovered",
  "payment_completed",
]

export async function GET() {
  try {
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    // user_profiles is keyed by auth user id; only select columns that exist in the live schema.
    const profileFields = "id, role, position, department_id, email"
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select(profileFields)
      .eq("id", user.id)
      .maybeSingle()
    const { data: profileByEmail } = !profile && user.email
      ? await admin.from("user_profiles").select(profileFields).eq("email", user.email).maybeSingle()
      : { data: null }
    const resolvedProfile = profile || profileByEmail
    const metadataRole = (user.user_metadata as Record<string, unknown> | undefined)?.role
    const role = normalizeRole(resolvedProfile?.role || String(metadataRole || ""))
    const departmentName = ""
    const departmentCode = String((resolvedProfile as any)?.department_id || "")
    const accountAccessText = [
      role,
      String(resolvedProfile?.position || ""),
      departmentName,
      departmentCode,
      String((user.user_metadata as Record<string, unknown> | undefined)?.department || ""),
    ].join(" ").toLowerCase()
    const canViewRunningLoans = Boolean(
      isAdminRole(role) ||
      ALLOWED_ROLES.has(role) ||
      role.includes("account") ||
      accountAccessText.includes("account") ||
      accountAccessText.includes("finance") ||
      canDoAccounts(role, departmentName, departmentCode) ||
      canDoLoanOffice(role, departmentName, departmentCode) ||
      canDoHrOffice(role, departmentName, departmentCode) ||
      isAccountsExecutiveRole(role) ||
      /admin|administrator/i.test(String(resolvedProfile?.position || "")) ||
      /admin|administrator/i.test(String(metadataRole || "")),
    )
    if (profileError) console.error("[v0] running loans profile lookup failed", profileError)
    if (!canViewRunningLoans) {
      return NextResponse.json({ error: "You are not authorized to view running loans" }, { status: 403 })
    }

    const { data: loans, error: loansError } = await admin
      .from("loan_requests")
      .select("*")
      // Include imported active and completed loans so historical records remain visible.
      .in("status", RUNNING_LOAN_STATUSES)
      .not("md_approved_at", "is", null)
      .not("disbursement_date", "is", null)
      .order("created_at", { ascending: false })
    if (loansError) throw loansError

    const confirmedLoans = (loans || []).filter((loan: any) => {
      return Boolean(loan.md_approved_at && loan.disbursement_date) && RUNNING_LOAN_STATUSES.includes(String(loan.status || ""))
    })
    const ids = confirmedLoans.map((loan) => loan.id)
    const staffIds = [...new Set(confirmedLoans.map((loan) => loan.staff_id || loan.user_id).filter(Boolean))]
    const [{ data: payments }, { data: schedules }, { data: staffById }, { data: staffByEmployeeId }] = await Promise.all([
      ids.length ? admin.from("loan_payment_records").select("loan_request_id, amount_paid, overall_status, accounts_approval_status, payment_date, submitted_at").in("loan_request_id", ids).eq("accounts_approval_status", "approved") : Promise.resolve({ data: [] }),
      ids.length ? admin.from("loan_repayment_schedule").select("loan_request_id, due_date, monthly_amount, paid_amount, paid_date, status").in("loan_request_id", ids).order("due_date", { ascending: true }) : Promise.resolve({ data: [] }),
      staffIds.length ? admin.from("user_profiles").select("id, employee_id, first_name, last_name, department_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)").in("id", staffIds) : Promise.resolve({ data: [] }),
      staffIds.length ? admin.from("user_profiles").select("id, employee_id, first_name, last_name, department_id").in("employee_id", staffIds) : Promise.resolve({ data: [] }),
    ])

    const staffMap = new Map([...(staffById || []), ...(staffByEmployeeId || [])].map((person: any) => [String(person.id), person]))
    for (const person of staffByEmployeeId || []) staffMap.set(String(person.employee_id), person)
    const paymentsByLoan = new Map<string, number>()
    const approvedPaymentDates = new Map<string, string[]>()
    for (const payment of payments || []) {
      paymentsByLoan.set(payment.loan_request_id, (paymentsByLoan.get(payment.loan_request_id) || 0) + Number(payment.amount_paid || 0))
      approvedPaymentDates.set(payment.loan_request_id, [...(approvedPaymentDates.get(payment.loan_request_id) || []), payment.payment_date || payment.submitted_at])
    }
    const { data: overrides } = ids.length ? await admin.from("loan_admin_operational_overrides").select("loan_request_id, paid_to_date, outstanding_balance, next_payment_due, next_payment_amount, expected_completion_date").in("loan_request_id", ids) : { data: [] }
    const overrideByLoan = new Map((overrides || []).map((item: any) => [item.loan_request_id, item]))
    const scheduleByLoan = new Map<string, any[]>()
    for (const item of schedules || []) scheduleByLoan.set(item.loan_request_id, [...(scheduleByLoan.get(item.loan_request_id) || []), item])

    const rows = confirmedLoans.map((loan) => {
      const total = Number(loan.fixed_amount || 0)
      const paidToDate = paymentsByLoan.get(loan.id) || 0
      const outstanding = Math.max(total - paidToDate, 0)
      const schedule = scheduleByLoan.get(loan.id) || []
      const remaining = schedule.filter((item) => item.status !== "paid" && item.status !== "waived")
      const completionDate = schedule.at(-1)?.due_date || null
      const nextPayment = remaining[0] || null
      const override: any = overrideByLoan.get(loan.id)
      const effectivePaidToDate = override?.paid_to_date == null ? paidToDate : Number(override.paid_to_date)
      const effectiveOutstanding = override?.outstanding_balance == null ? outstanding : Number(override.outstanding_balance)
      const effectiveNextDue = override?.next_payment_due || nextPayment?.due_date || null
      const effectiveNextAmount = override?.next_payment_amount == null ? Number(nextPayment?.monthly_amount || 0) : Number(override.next_payment_amount)
      const effectiveCompletion = override?.expected_completion_date || completionDate
      const approvedFullPaymentDate = effectiveOutstanding <= 0 ? (approvedPaymentDates.get(loan.id) || []).sort().at(-1) || null : null
      const isCompleted = effectiveOutstanding <= 0
      return {
        ...loan,
        staff: (() => {
          const person: any = staffMap.get(loan.staff_id || loan.user_id)
          return person ? {
            ...person,
            full_name: [person.first_name, person.last_name].filter(Boolean).join(" ") || loan.staff_full_name || "Unknown staff",
            staff_number: person.employee_id || loan.staff_number || "",
            location_name: person.geofence_locations?.name || loan.staff_location_name || "Unknown location",
          } : {
            full_name: loan.staff_full_name || "Unknown staff",
            staff_number: loan.staff_number || "",
            department_id: loan.department_id || "",
            location_name: loan.staff_location_name || "Unknown location",
          }
        })(),
        total_amount: total,
        paid_to_date: effectivePaidToDate,
        outstanding_balance: effectiveOutstanding,
        next_payment_due: effectiveNextDue,
        next_payment_amount: effectiveNextAmount,
        expected_completion_date: effectiveCompletion,
        completed_payment_date: approvedFullPaymentDate,
        reapplication_eligible: isCompleted,
        repayment_status: isCompleted ? "completed" : remaining.some((item) => item.status === "overdue") ? "overdue" : "on_track",
      }
    })

    return NextResponse.json({ data: rows, generated_at: new Date().toISOString() })
  } catch (error) {
    console.error("[v0] running loans report error", error)
    return NextResponse.json({ error: "Failed to load running loans report" }, { status: 500 })
  }
}
