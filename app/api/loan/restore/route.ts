import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { normalizeRole } from "@/lib/loan-workflow"

// API endpoint to restore archived loans back to mainstream tracking
// PUT /api/loan/restore
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to verify permissions
    const { data: userProfile } = await admin
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

    // Get the loan to verify it's archived
    const { data: loan, error: fetchError } = await admin
      .from("loan_applications")
      .select("*")
      .eq("id", loanId)
      .maybeSingle()

    console.log("[v0] Restore loan search:", { loanId, found: !!loan, status: loan?.status, fetchError })

    if (fetchError || !loan) {
      console.error("[v0] Loan not found:", { loanId, fetchError })
      return NextResponse.json(
        { error: "Loan not found", details: fetchError?.message },
        { status: 404 }
      )
    }

    if (loan.status !== "archived") {
      console.warn("[v0] Loan is not archived:", { loanId, currentStatus: loan.status })
      return NextResponse.json(
        { error: `Only archived loans can be restored. Current status: ${loan.status}` },
        { status: 400 }
      )
    }

    // Restore the loan - set status back to partially_recovered (or the specified status)
    const restorationStatus = newStatus || "partially_recovered"
    
    console.log("[v0] Attempting to restore loan:", { loanId, newStatus: restorationStatus })
    
    const { data: restored, error: updateError } = await admin
      .from("loan_applications")
      .update({
        status: restorationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loanId)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error restoring loan:", { loanId, error: updateError.message, details: updateError })
      return NextResponse.json(
        { error: "Failed to restore loan", details: updateError.message },
        { status: 500 }
      )
    }
    
    console.log("[v0] Loan restored successfully:", { loanId, newStatus: restored?.status })

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
