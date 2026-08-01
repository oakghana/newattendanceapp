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
    const { loanRequestId, startDate, durationMonths } = body

    if (!loanRequestId) {
      return NextResponse.json({ error: "Missing loanRequestId" }, { status: 400 })
    }

    const duration = durationMonths || 12
    const start = startDate ? new Date(startDate) : new Date()

    // Call the database function to generate repayment schedule
    const { data, error } = await admin.rpc("generate_repayment_schedule", {
      p_loan_request_id: loanRequestId,
      p_start_date: start.toISOString().split("T")[0],
      p_duration_months: duration,
    })

    if (error) {
      console.error("[v0] Error generating repayment schedule:", error)
      return NextResponse.json({ error: "Failed to generate repayment schedule" }, { status: 500 })
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
        updated_at
      `)
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
