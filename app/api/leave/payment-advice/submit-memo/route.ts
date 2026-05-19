import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { groupStaffByCategory } from "@/lib/payment-advice-service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    let requestBody: any
    try {
      requestBody = await request.json()
    } catch (parseErr: any) {
      console.error("[v0] JSON parse error:", parseErr.message)
      return NextResponse.json(
        { error: "Invalid JSON in request body", details: parseErr.message },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { month, memos, staffList, selectedSigner, referenceNumbers } = requestBody

    if (!month || !memos || !staffList || !selectedSigner || !referenceNumbers) {
      console.error("[v0] Missing fields:", { month: !!month, memos: !!memos, staffList: !!staffList, selectedSigner: !!selectedSigner, referenceNumbers: !!referenceNumbers })
      return NextResponse.json(
        { error: "Missing required fields", details: "month, memos, staffList, selectedSigner, and referenceNumbers are all required" },
        { status: 400 }
      )
    }

    // Group staff by category
    const categories = groupStaffByCategory(staffList)
    
    // Create individual payment memo records for each staff member
    const memoRecords: any[] = []
    const errors: string[] = []

    for (const staff of staffList) {
      // Get the reference number for this staff's category
      const category = staff.category || staff.staff_category || "Junior"
      const refNumber = referenceNumbers[category] || ""
      
      // Build memo body with all relevant info
      const memoBody = {
        month,
        referenceNumber: refNumber,
        category,
        selectedSigner: {
          id: selectedSigner.id || "",
          name: selectedSigner.name || "",
          position: selectedSigner.position || "",
        },
      }

      // Only insert if we have required fields
      if (staff.leave_plan_request_id && staff.user_id) {
        memoRecords.push({
          leave_plan_request_id: staff.leave_plan_request_id,
          staff_id: staff.user_id,
          staff_name: staff.full_name || "",
          staff_number: staff.staff_number || staff.employee_id || "",
          memo_body: JSON.stringify(memoBody),
          memo_subject: `Payment of Leave Allowance (${category} Staff) - ${month}`,
          hr_leave_office_id: user.id,
          hr_leave_office_name: selectedSigner.name || "",
          status: "pending",
          leave_period_start: staff.leave_start_date || staff.preferred_start_date || null,
          leave_period_end: staff.leave_end_date || staff.preferred_end_date || null,
          approved_days: staff.approved_days || staff.requested_days || 0,
        })
      } else {
        console.log("[v0] Staff validation failed:", {
          name: staff.full_name,
          has_leave_plan_request_id: !!staff.leave_plan_request_id,
          has_user_id: !!staff.user_id,
          staff_keys: Object.keys(staff),
          staff,
        })
        errors.push(`Missing leave_plan_request_id or user_id for ${staff.full_name}`)
      }
    }

    if (memoRecords.length === 0) {
      console.error("[v0] No valid memo records to insert:", errors)
      return NextResponse.json(
        { error: "No valid staff records", details: errors.join("; ") },
        { status: 400 }
      )
    }

    // Insert all memo records
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert(memoRecords)
      .select("id")

    if (error) {
      console.error("[v0] Error saving memos:", error)
      return NextResponse.json(
        { error: "Failed to save memos", details: error.message },
        { status: 500 }
      )
    }

    console.log("[v0] Memos saved successfully:", data?.length || 0, "records")
    return NextResponse.json({ 
      success: true, 
      memoCount: data?.length || 0,
      warnings: errors.length > 0 ? errors : undefined
    })
  } catch (err: any) {
    console.error("[v0] Error submitting memo:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
