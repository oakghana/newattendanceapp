import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isAdminRole, normalizeRole } from "@/lib/loan-workflow"

const EDITABLE_STATUSES = new Set([
  "hod_approved",
  "sent_to_accounts",
  "approved_director",
  "awaiting_committee",
  "awaiting_hr_terms",
  "awaiting_director_hr",
  "staff_receiving_funds",
  "partially_recovered",
  "payment_completed",
])

async function requireAdministrator() {
  const { user } = await createClientAndGetUser()
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const admin = await createAdminClient()
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, position")
    .or(`id.eq.${user.id},email.eq.${user.email || ""}`)
    .limit(1)
    .maybeSingle()
  const metadataRole = String((user.user_metadata as Record<string, unknown> | undefined)?.role || "")
  const role = normalizeRole(profile?.role || metadataRole)
  const isAdministrator = isAdminRole(role) || /admin|administrator/i.test(String(profile?.position || "")) || /admin|administrator/i.test(metadataRole)
  if (!isAdministrator) return { user: null, error: NextResponse.json({ error: "Only administrators can edit running loans" }, { status: 403 }) }
  return { user, error: null }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdministrator()
    if (access.error) return access.error
    const body = await request.json()
    const loanId = typeof body.loanId === "string" ? body.loanId : ""
    const correctionNote = typeof body.correctionNote === "string" ? body.correctionNote.trim() : ""
    const fixedAmount = Number(body.fixedAmount)
    const recoveryMonths = Number(body.recoveryMonths)
    const disbursementDate = typeof body.disbursementDate === "string" ? body.disbursementDate : ""

    if (!loanId || !correctionNote) return NextResponse.json({ error: "Loan, correction note, and reason are required" }, { status: 400 })
    if (!Number.isFinite(fixedAmount) || fixedAmount <= 0) return NextResponse.json({ error: "Loan amount must be greater than zero" }, { status: 400 })
    if (!Number.isInteger(recoveryMonths) || recoveryMonths <= 0 || recoveryMonths > 120) return NextResponse.json({ error: "Recovery period must be between 1 and 120 months" }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(disbursementDate)) return NextResponse.json({ error: "Enter a valid disbursement date" }, { status: 400 })

    const admin = await createAdminClient()
    const { data: existing, error: fetchError } = await admin.from("loan_requests").select("id, fixed_amount, recovery_months, disbursement_date, status, request_number, staff_full_name").eq("id", loanId).maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: "Running loan not found" }, { status: 404 })
    if (!EDITABLE_STATUSES.has(String(existing.status || ""))) return NextResponse.json({ error: "Only running loans can be corrected" }, { status: 409 })

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin.from("loan_requests").update({ fixed_amount: fixedAmount, recovery_months: recoveryMonths, repayment_duration_months: recoveryMonths, disbursement_date: disbursementDate, updated_at: now, governance_updated_at: now }).eq("id", loanId).select("id").single()
    if (updateError) throw updateError

    await admin.from("loan_request_timeline").insert({ loan_request_id: loanId, actor_id: access.user!.id, actor_role: "administrator", action_key: "administrator_correction", from_status: existing.status, to_status: existing.status, note: correctionNote, metadata: { old_values: { fixed_amount: existing.fixed_amount, recovery_months: existing.recovery_months, disbursement_date: existing.disbursement_date }, new_values: { fixed_amount: fixedAmount, recovery_months: recoveryMonths, disbursement_date: disbursementDate } }, created_at: now })
    await admin.from("audit_logs").insert({ user_id: access.user!.id, action: "LOAN_RUNNING_CORRECTION", table_name: "loan_requests", record_id: loanId, old_values: { fixed_amount: existing.fixed_amount, recovery_months: existing.recovery_months, disbursement_date: existing.disbursement_date }, new_values: { fixed_amount: fixedAmount, recovery_months: recoveryMonths, disbursement_date: disbursementDate }, details: { correction_note: correctionNote, request_number: existing.request_number, staff_full_name: existing.staff_full_name }, created_at: now })

    return NextResponse.json({ data: updated, message: "Running loan corrected successfully" })
  } catch (error) {
    console.error("[v0] running loan correction failed", error)
    return NextResponse.json({ error: "Could not correct running loan" }, { status: 500 })
  }
}

export const POST = PATCH
