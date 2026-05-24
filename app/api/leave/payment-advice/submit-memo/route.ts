import { createClient, createAdminClient } from "@/lib/supabase/server"
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
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch the actual submitter's (HR Leave Office) profile name
    const { data: submitterProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, position")
      .eq("id", user.id)
      .single()

    const submitterName = submitterProfile
      ? `${submitterProfile.first_name || ""} ${submitterProfile.last_name || ""}`.trim()
      : (user.user_metadata?.full_name || user.email || "HR Leave Office")

    const { month, memos, staffList, selectedSigner, referenceNumbers } = requestBody

    if (!month || !memos || !staffList || !selectedSigner || !referenceNumbers) {
      console.error("[v0] Missing fields:", { month: !!month, memos: !!memos, staffList: !!staffList, selectedSigner: !!selectedSigner, referenceNumbers: !!referenceNumbers })
      return NextResponse.json(
        { error: "Missing required fields", details: "month, memos, staffList, selectedSigner, and referenceNumbers are all required" },
        { status: 400 }
      )
    }

    // VALIDATION: Verify the selected signer is a valid HR Executive
    if (!selectedSigner.id) {
      return NextResponse.json(
        { error: "Invalid signer", details: "HR Executive signer must be selected" },
        { status: 400 }
      )
    }

    // Fetch the signer's user profile to validate their role
    const { data: signerProfile, error: signerError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, role, position, email")
      .eq("id", selectedSigner.id)
      .single()

    if (signerError || !signerProfile) {
      return NextResponse.json(
        { error: "Signer not found", details: "The selected HR Executive does not exist in the system" },
        { status: 404 }
      )
    }

    // CRITICAL VALIDATION: Verify signer has HR Executive role
    const validHrRoles = ["hr_executive", "hr_manager", "hr_director", "hr_officer", "manager_hr", "manager", "deputy_hr"]
    if (!validHrRoles.includes(signerProfile.role)) {
      console.warn("[v0] Invalid signer role attempt:", {
        signerId: selectedSigner.id,
        signerRole: signerProfile.role,
        attemptedRole: selectedSigner.role,
      })
      return NextResponse.json(
        { 
          error: "Invalid signer role", 
          details: `The selected signer (${signerProfile.first_name} ${signerProfile.last_name}) has role "${signerProfile.role}" but only HR managers/executives can sign payment memos.` 
        },
        { status: 403 }
      )
    }

    // FETCH SIGNER'S SIGNATURE IMAGE for inclusion in memo
    let signerSignatureUrl: string | undefined
    const { data: signatureRecord } = await admin
      .from("approval_signature_registry")
      .select("signature_data_url")
      .eq("user_id", selectedSigner.id)
      .eq("is_active", true)
      .single()

    if (signatureRecord?.signature_data_url) {
      signerSignatureUrl = signatureRecord.signature_data_url
      console.log("[v0] Signer signature found and will be included in memos:", signerSignatureUrl)
    } else {
      console.warn("[v0] Signer has no saved signature - memos will be generated without signature image:", selectedSigner.id)
    }

    // Group staff by category
    const categories = groupStaffByCategory(staffList)
    
    // Create individual payment memo records for each staff member
    const memoRecords: any[] = []
    const errors: string[] = []
    const skippedDuplicates: string[] = []

    // Check for existing memos to prevent duplicates
    const staffIds = staffList.map((s: any) => s.user_id).filter(Boolean)
    const { data: existingMemos } = await admin
      .from("leave_payment_memos")
      .select("staff_id, memo_subject, status")
      .in("staff_id", staffIds)
      .like("memo_subject", `%${month}%`)
      .in("status", ["ready_for_review", "reviewed_by_hr", "forwarded_to_accounts"])

    const existingStaffIds = new Set(existingMemos?.map((m) => m.staff_id) || [])

    for (const staff of staffList) {
      // Skip if this staff already has a memo for this month
      if (existingStaffIds.has(staff.user_id)) {
        skippedDuplicates.push(`${staff.full_name} already has a pending/approved payment memo for ${month}`)
        continue
      }

      // Get the reference number for this staff's category
      const category = staff.category || staff.staff_category || "Junior"
      const refNumber = referenceNumbers[category] || ""
      
      // Build memo body with all relevant info including staff details for PDF generation
      const memoBody = {
        month,
        referenceNumber: refNumber,
        category,
        staff_position: staff.position || staff.rank || "",
        staff_department: staff.department_name || staff.department || "",
        staff_rank_label: staff.staff_category || category,
        selectedSigner: {
          id: selectedSigner.id || "",
          name: selectedSigner.name || "",
          position: selectedSigner.position || "",
          signature_image_url: signerSignatureUrl, // Include signer's signature in memo data
        },
      }

      // Validate that selectedSigner has required fields and proper role
      if (!selectedSigner || !selectedSigner.id) {
        errors.push("HR Executive signer not selected for memo submission")
        continue
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
          hr_leave_office_name: submitterName,
          leave_period_start: staff.leave_start_date || staff.preferred_start_date || null,
          leave_period_end: staff.leave_end_date || staff.preferred_end_date || null,
          approved_days: staff.approved_days || staff.requested_days || 0,
          // Status for HR Executive approval (valid statuses: draft, ready_for_review, reviewed_by_hr, forwarded_to_accounts, acknowledged_by_accounts)
          status: "ready_for_review",
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
      warnings: errors.length > 0 ? errors : undefined,
      skippedDuplicates: skippedDuplicates.length > 0 ? skippedDuplicates : undefined
    })
  } catch (err: any) {
    console.error("[v0] Error submitting memo:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
