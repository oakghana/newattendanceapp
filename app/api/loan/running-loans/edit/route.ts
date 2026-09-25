import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isAdminRole, normalizeRole } from "@/lib/loan-workflow"

const numberField = (value: unknown, label: string) => {
  if (value === undefined || value === "") return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a valid non-negative number`)
  return parsed
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const admin = await createAdminClient()
    const { data: profile } = await admin.from("user_profiles").select("role, position").eq("id", user.id).maybeSingle()
    const role = normalizeRole(String(profile?.role || (user.user_metadata as Record<string, unknown> | undefined)?.role || ""))
    if (!isAdminRole(role) && !/admin|administrator/i.test(String(profile?.position || ""))) {
      return NextResponse.json({ error: "Only administrators can correct running-loan operational fields." }, { status: 403 })
    }

    const body = await request.json()
    const loanRequestId = String(body.loanRequestId || "")
    const reason = String(body.reason || "").trim()
    if (!loanRequestId || reason.length < 5) return NextResponse.json({ error: "Loan and a correction reason of at least 5 characters are required." }, { status: 400 })
    const values = {
      paid_to_date: numberField(body.paidToDate, "Paid to date"),
      outstanding_balance: numberField(body.outstandingBalance, "Outstanding balance"),
      next_payment_due: body.nextPaymentDue || null,
      next_payment_amount: numberField(body.nextPaymentAmount, "Next payment amount"),
      expected_completion_date: body.expectedCompletionDate || null,
      reason,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }
    if (values.paid_to_date === undefined && values.outstanding_balance === undefined && values.next_payment_amount === undefined && !values.next_payment_due && !values.expected_completion_date) {
      return NextResponse.json({ error: "At least one operational field must be supplied." }, { status: 400 })
    }
    const { data: loan } = await admin.from("loan_requests").select("id, status, fixed_amount, repayment_duration_months").eq("id", loanRequestId).maybeSingle()
    if (!loan) return NextResponse.json({ error: "Running loan not found" }, { status: 404 })
    if (["cancelled", "rejected"].includes(String(loan.status))) return NextResponse.json({ error: "This loan cannot be corrected." }, { status: 409 })
    const { data, error } = await admin.from("loan_admin_operational_overrides").upsert({ loan_request_id: loanRequestId, ...values }, { onConflict: "loan_request_id" }).select().single()
    if (error) throw error
    await admin.from("audit_logs").insert({ user_id: user.id, action: "RUNNING_LOAN_OPERATIONAL_CORRECTION", table_name: "loan_admin_operational_overrides", record_id: loanRequestId, details: { reason, fields: values } })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[v0] running loan operational correction failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save correction" }, { status: 500 })
  }
}
