import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { loanRequestId, startDate, durationMonths, action, scheduleId, paymentStatus, notes } = body

    if (action === "confirm_payment") {
      const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
      if (!profile || !["accounts", "accounts_executive", "accounts_loan_office", "admin"].includes(String(profile.role))) {
        return NextResponse.json({ error: "Only Accounts officers can confirm monthly loan payments." }, { status: 403 })
      }
      if (!scheduleId || !["paid", "not_paid"].includes(paymentStatus)) return NextResponse.json({ error: "scheduleId and paymentStatus are required" }, { status: 400 })
      const { data: schedule } = await admin.from("loan_repayment_schedule").select("id, loan_request_id, monthly_amount, due_date").eq("id", scheduleId).maybeSingle()
      if (!schedule) return NextResponse.json({ error: "Installment not found" }, { status: 404 })
      const month = new Date(schedule.due_date).toISOString().slice(0, 7) + "-01"
      const { data, error } = await admin.from("loan_monthly_payment_confirmations").upsert({ loan_request_id: schedule.loan_request_id, schedule_id: schedule.id, confirmation_month: month, payment_status: paymentStatus, confirmed_by: user.id, confirmed_at: new Date().toISOString(), notes: notes || null }, { onConflict: "schedule_id,confirmation_month" }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const scheduleUpdate = paymentStatus === "paid" ? { status: "paid", paid_amount: schedule.monthly_amount, paid_date: new Date().toISOString().slice(0, 10) } : { status: "overdue", paid_amount: 0, paid_date: null }
      await admin.from("loan_repayment_schedule").update(scheduleUpdate).eq("id", schedule.id)
      return NextResponse.json({ success: true, data })
    }

    if (!loanRequestId) {
      return NextResponse.json({ error: "Missing loanRequestId" }, { status: 400 })
    }

    const duration = durationMonths || 12
    const start = startDate ? new Date(startDate) : new Date()

    const { data: loan, error: loanError } = await admin.from("loan_requests").select("id, status, md_approved_at, disbursement_date, recovery_start_date, recovery_months, repayment_duration_months, hod_review_note").eq("id", loanRequestId).maybeSingle()
    if (loanError || !loan) return NextResponse.json({ error: "Loan request not found" }, { status: 404 })
    const isLegacyImported = String(loan.hod_review_note || "").toLowerCase().startsWith("bulk imported by administrator")
    if (!isLegacyImported && (!loan.md_approved_at || !loan.disbursement_date || !["partially_recovered", "payment_completed"].includes(String(loan.status)))) {
      return NextResponse.json({ error: "Repayment schedules are available only for MD-approved loans confirmed as disbursed by Accounts." }, { status: 409 })
    }

    // Call the database function to generate repayment schedule
    const { data, error } = await admin.rpc("generate_repayment_schedule", {
      p_loan_request_id: loanRequestId,
      p_start_date: start.toISOString().split("T")[0],
      p_duration_months: duration,
    })

    if (error) {
      console.error("[v0] Error generating repayment schedule:", error)
      return NextResponse.json({ error: error.message || "Failed to generate repayment schedule", code: error.code }, { status: 500 })
    }

    // Update the loan request with repayment plan generation timestamp
    await admin
      .from("loan_requests")
      .update({
        repayment_plan_generated_at: new Date().toISOString(),
        repayment_duration_months: duration,
        repayment_status: "active",
      })
      .eq("id", loanRequestId)

    return NextResponse.json(
      {
        success: true,
        data: data,
        message: `Repayment schedule generated with ${duration} monthly installments`,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error("[v0] Repayment generation error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Retrieve repayment schedule entries from loan_repayment_schedule (the real table)
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const loanRequestId = searchParams.get("loanRequestId")

    // Use loan_repayment_schedule which is confirmed to exist in the schema
    let query = admin
      .from("loan_repayment_schedule")
      .select(`
        id,
        loan_request_id,
        installment_number,
        due_date,
        monthly_amount,
        paid_amount,
        paid_date,
        payment_record_id,
        status,
        created_at,
        updated_at,
        loan_requests!inner(staff_full_name, request_number, md_approved_at, disbursement_date, status)
      `)
      .eq("loan_requests.status", "partially_recovered")
      .not("loan_requests.md_approved_at", "is", null)
      .not("loan_requests.disbursement_date", "is", null)

      .order("due_date", { ascending: true })

    if (loanRequestId) {
      query = query.eq("loan_request_id", loanRequestId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching repayment schedule:", error)
      return NextResponse.json({ error: "Failed to fetch repayment data", details: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      message: data?.length ? `Found ${data.length} repayment entries` : "No repayment schedule found yet",
    })
  } catch (err) {
    console.error("[v0] Repayment GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
