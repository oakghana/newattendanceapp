import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { normalizeRole } from "@/lib/loan-workflow"

// API endpoint to restore archived loans back to mainstream tracking
// PUT /api/loan/restore
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to verify permissions using the authenticated client
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = normalizeRole((userProfile as any)?.role || "")
    const isAuthorized = ["hr_executive", "accounts_executive", "loan_office", "admin"].includes(userRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "You do not have permission to restore loans" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { loanId, newStatus } = body

    if (!loanId) {
      return NextResponse.json(
        { error: "Loan ID is required" },
        { status: 400 }
      )
    }

    // Get the loan using the authenticated client — no service role key needed
    const { data: loan, error: fetchError } = await supabase
      .from("loan_applications")
      .select("id, status")
      .eq("id", loanId)
      .maybeSingle()

    if (fetchError || !loan) {
      return NextResponse.json(
        { error: "Loan not found", details: fetchError?.message },
        { status: 404 }
      )
    }

    if (loan.status !== "archived") {
      return NextResponse.json(
        { error: `Only archived loans can be restored. Current status: ${loan.status}` },
        { status: 400 }
      )
    }

    const restorationStatus = newStatus || "partially_recovered"

    const { data: restored, error: updateError } = await supabase
      .from("loan_applications")
      .update({
        status: restorationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loanId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to restore loan", details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Loan restored successfully",
      loan: restored,
    })
  } catch (error) {
    console.error("Error in restore route:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
