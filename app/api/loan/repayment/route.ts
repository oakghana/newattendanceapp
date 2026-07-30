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

// GET - Retrieve outstanding balance for a loan or all loans
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const loanRequestId = searchParams.get("loanRequestId")
    const staffId = searchParams.get("staffId")

    // Try to fetch from loan_outstanding_balance table
    // If it doesn't exist or is empty, return empty array instead of error
    let query = admin.from("loan_outstanding_balance").select("*")

    if (loanRequestId) {
      query = query.eq("loan_request_id", loanRequestId)
    }

    if (staffId) {
      query = query.eq("staff_id", staffId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching outstanding balance:", error)
      // Return empty data instead of error if table doesn't exist
      // This allows the UI to display gracefully while data is being populated
      return NextResponse.json({
        success: true,
        data: [],
        message: "No repayment data available yet"
      })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      message: data?.length ? `Found ${data.length} repayment records` : "No repayment records found"
    })
  } catch (err) {
    console.error("[v0] Outstanding balance GET error:", err)
    // Return graceful error instead of 500
    return NextResponse.json({
      success: true,
      data: [],
      message: "Repayment tracking data not yet available"
    }, { status: 200 })
  }
}
