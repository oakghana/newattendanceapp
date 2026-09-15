import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"

const ALLOWED_ROLES = new Set(["admin", "accounts", "accounts_executive", "hr_loan_office", "hr-loan-office", "hr_loan"])

export async function GET() {
  try {
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: profile } = await admin.from("user_profiles").select("id, role, full_name, staff_number").eq("id", user.id).maybeSingle()
    if (!profile || !ALLOWED_ROLES.has(String(profile.role || "").toLowerCase())) {
      return NextResponse.json({ error: "You are not authorized to view running loans" }, { status: 403 })
    }

    const { data: loans, error: loansError } = await admin
      .from("loan_requests")
      .select("id, request_number, staff_id, fixed_amount, loan_type_label, status, repayment_duration_months, repayment_plan_generated_at")
      .in("status", ["approved_director", "approved", "active", "director_approved"])
      .order("created_at", { ascending: false })
    if (loansError) throw loansError

    const ids = (loans || []).map((loan) => loan.id)
    const staffIds = [...new Set((loans || []).map((loan) => loan.staff_id).filter(Boolean))]
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

    const rows = (loans || []).map((loan) => {
      const total = Number(loan.fixed_amount || 0)
      const paidToDate = paymentsByLoan.get(loan.id) || 0
      const outstanding = Math.max(total - paidToDate, 0)
      const schedule = scheduleByLoan.get(loan.id) || []
      const remaining = schedule.filter((item) => item.status !== "paid" && item.status !== "waived")
      const completionDate = remaining.at(-1)?.due_date || schedule.at(-1)?.due_date || null
      const nextPayment = remaining[0] || null
      return {
        ...loan,
        staff: staffMap.get(loan.staff_id) || null,
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
