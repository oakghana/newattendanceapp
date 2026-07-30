import { createClient } from "@/utils/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(request: NextRequest) {
  try {
    const admin = createClient({ admin: true })
    const user = await admin.auth.admin.getUserById(
      request.headers.get("x-user-id") || ""
    )

    if (!user.data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    if (fetchError || !loan) {
      return NextResponse.json(
        { error: "Loan not found" },
        { status: 404 }
      )
    }

    if (loan.status !== "archived") {
      return NextResponse.json(
        { error: "Only archived loans can be restored" },
        { status: 400 }
      )
    }

    // Verify user has permission (HR executive or accounts executive)
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.data.user.id)
      .maybeSingle()

    const userRole = (userProfile as any)?.role || ""
    const isAuthorized = ["hr_executive", "accounts_executive", "loan_office", "admin"].includes(userRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "You do not have permission to restore loans" },
        { status: 403 }
      )
    }

    // Restore the loan - set status back to partially_recovered (or the specified status)
    const restorationStatus = newStatus || "partially_recovered"
    
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
      console.error("Error restoring loan:", updateError)
      return NextResponse.json(
        { error: "Failed to restore loan" },
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
