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
      console.error("[v0] Missing fields:", { 
        month: !!month, 
        memos: !!memos, 
        staffList: !!staffList, 
        selectedSigner: !!selectedSigner, 
        referenceNumbers: !!referenceNumbers,
        selectedSignerValue: selectedSigner
      })
      return NextResponse.json(
        { 
          error: "Missing required fields", 
          details: `Required: month (${!!month}), memos (${!!memos}), staffList (${!!staffList}), selectedSigner (${!!selectedSigner}), referenceNumbers (${!!referenceNumbers}). Ensure at least one HR executive is selected.`,
          receivedSigner: selectedSigner ? "object" : selectedSigner
        },
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
    // All roles that can sign/approve payment advice memos
    const validHrRoles = ["hr_executive", "hr_manager", "hr_director", "director_hr", "hr_officer", "manager_hr", "manager", "deputy_hr"]
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
    // Priority: Frontend → user_profiles → approval_signature_registry
    let signerSignatureUrl: string | undefined = selectedSigner.signature_image_url
    
    // First priority: Check user_profiles (primary storage location)
    if (!signerSignatureUrl) {
      const { data: userProfile } = await admin
        .from("user_profiles")
        .select("signature_data_url")
        .eq("id", selectedSigner.id)
        .single()

      if (userProfile?.signature_data_url) {
        signerSignatureUrl = userProfile.signature_data_url
        console.log("[v0] Signer signature found in user_profiles for:", selectedSigner.id)
      }
    }
    
    // Second priority: Check approval_signature_registry (fallback)
    if (!signerSignatureUrl) {
      const { data: signatureRecord } = await admin
        .from("approval_signature_registry")
        .select("signature_data_url")
        .eq("user_id", selectedSigner.id)
        .eq("is_active", true)
        .single()

      if (signatureRecord?.signature_data_url) {
        signerSignatureUrl = signatureRecord.signature_data_url
        console.log("[v0] Signer signature found in approval_signature_registry for:", selectedSigner.id)
      }
    }
    
    if (signerSignatureUrl) {
      console.log("[v0] Signer signature found and will be included in memos:", {
        signerId: selectedSigner.id,
        signerName: selectedSigner.name,
        signatureLength: signerSignatureUrl.length,
      })
    } else {
      console.warn("[v0] Signer has no saved signature - memos will be generated without signature image:", selectedSigner.id)
    }

    // Group staff by category
    const categories = groupStaffByCategory(staffList)
    
    console.log("[v0] Processing staffList:", {
      totalStaff: staffList.length,
      staffSamples: staffList.slice(0, 3).map((s: any) => ({
        name: s.full_name,
        user_id: s.user_id,
        leave_plan_request_id: s.leave_plan_request_id,
        fields: Object.keys(s)
      })),
      categories
    })
    
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
      // Use actual rank/position name, not category (e.g., "Senior Officer" not "junior")
      const staffRankLabel = staff.rank || staff.position || staff.staff_category || category
      
      const memoBody = {
        month,
        referenceNumber: refNumber,
        category,
        staff_position: staff.position || staff.rank || "",
        staff_department: staff.department_name || staff.department || "",
        staff_rank_label: staffRankLabel, // Actual rank name (e.g., "Senior Officer", "Manager", "Accounts Officer")
        staff_location_name: staff.location_name || staff.assigned_location_name || "HQ", // Beneficiary location name
        staff_location_id: staff.location_id || staff.assigned_location_id || null,
        selectedSigner: {
          id: selectedSigner.id || "",
          name: selectedSigner.name || "",
          position: selectedSigner.position || "",
          signature_data_url: signerSignatureUrl, // Include signer's signature in memo data
        },
      }

      // Validate that selectedSigner has required fields and proper role
      if (!selectedSigner || !selectedSigner.id) {
        errors.push("HR Executive signer not selected for memo submission")
        continue
      }

      // Build the assigned_signers array - CRITICAL for approver visibility
      const assignedSigners = Array.isArray(requestBody.selectedSigners) && requestBody.selectedSigners.length > 0
        ? requestBody.selectedSigners.map((s: any) => s.id || s).filter(Boolean)
        : (selectedSigner.id ? [selectedSigner.id] : [])

      console.log("[v0] Memo signer assignment:", {
        memo_staff: staff.full_name,
        selectedSigner_id: selectedSigner.id,
        requestBody_selectedSigners: requestBody.selectedSigners?.map((s: any) => s.id),
        computed_assignedSigners: assignedSigners,
        isArray: Array.isArray(assignedSigners),
      })

      // Only insert if we have required fields
      if (staff.leave_plan_request_id && staff.user_id) {
        // CRITICAL: Use ONLY the database source of truth for dates
        // preferred_start_date and preferred_end_date come directly from leave_plan_requests table
        // This ensures all memos for the same leave request show identical dates
        let leave_start = null
        let leave_end = null
        
        // Use preferred_start_date as the source of truth (from database leave_plan_requests table)
        if (staff.preferred_start_date && staff.preferred_start_date !== "NaN" && staff.preferred_start_date !== "NaN-NaN-NaN") {
          const parsed = new Date(staff.preferred_start_date)
          if (!isNaN(parsed.getTime())) {
            leave_start = staff.preferred_start_date
          }
        }
        
        // Use preferred_end_date as the source of truth (from database leave_plan_requests table)
        if (staff.preferred_end_date && staff.preferred_end_date !== "NaN" && staff.preferred_end_date !== "NaN-NaN-NaN") {
          const parsed = new Date(staff.preferred_end_date)
          if (!isNaN(parsed.getTime())) {
            leave_end = staff.preferred_end_date
          }
        }
        
        // Log if dates are missing (indicates data quality issue)
        if (!leave_start || !leave_end) {
          console.warn("[v0] Missing leave dates for staff:", {
            name: staff.full_name,
            leave_plan_request_id: staff.leave_plan_request_id,
            preferred_start_date: staff.preferred_start_date,
            preferred_end_date: staff.preferred_end_date,
            leave_start,
            leave_end
          })
        }
        
        // CRITICAL: Always use adjusted_days (HR Leave Office approved days) as the source of truth
        // This prevents disparities where different memos show different days for the same leave request
        const approvedDaysForMemo = staff.adjusted_days || staff.approved_days || staff.requested_days || 0
        
        const memoRecord = {
          leave_plan_request_id: staff.leave_plan_request_id,
          staff_id: staff.user_id,
          staff_name: staff.full_name || "",
          staff_number: staff.staff_number || staff.employee_id || "",
          memo_body: JSON.stringify(memoBody),
          memo_subject: `Payment of Leave Allowance (${category} Staff) - ${month}`,
          hr_leave_office_id: user.id,
          hr_leave_office_name: submitterName,
          leave_period_start: leave_start || null,
          leave_period_end: leave_end || null,
          approved_days: approvedDaysForMemo,
          status: "ready_for_review",
          // CRITICAL: Store the list of HR executives who can approve this memo
          assigned_signers: assignedSigners,
        }
        
        // Log memo data for consistency verification across multiple memos
        console.log("[v0] Creating payment memo with database values:", {
          staff_name: staff.full_name,
          leave_period_start: leave_start,
          leave_period_end: leave_end,
          approved_days: approvedDaysForMemo,
          source_verification: {
            preferred_start_date: staff.preferred_start_date,
            preferred_end_date: staff.preferred_end_date,
            adjusted_days: staff.adjusted_days,
          }
        })
        
        memoRecords.push(memoRecord)
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
      // CASE 1: All staff were skipped because they already have memos for this month.
      // This is NOT a real error - the memos already exist and are pending/approved.
      if (skippedDuplicates.length > 0 && errors.length === 0) {
        console.log("[v0] All staff already have memos for this month:", skippedDuplicates)
        return NextResponse.json(
          {
            error: "Payment memos already exist",
            details: `All ${skippedDuplicates.length} selected staff member(s) already have payment memos for ${month}. ${skippedDuplicates.join("; ")}. You can review them in the existing memos list.`,
            alreadyExists: true,
            skippedDuplicates,
            staffCount: staffList.length,
          },
          { status: 409 }, // 409 Conflict - resource already exists
        )
      }

      // CASE 2: Genuine validation errors (missing fields, no signer, etc.)
      console.error("[v0] No valid memo records to insert:", {
        totalStaffCount: staffList.length,
        errorCount: errors.length,
        errors,
        skippedDuplicates,
        staffSampleData: staffList.slice(0, 2).map((s) => ({
          name: s.full_name,
          has_leave_plan_request_id: !!s.leave_plan_request_id,
          has_user_id: !!s.user_id,
          leave_plan_request_id: s.leave_plan_request_id,
          user_id: s.user_id,
        })),
      })
      return NextResponse.json(
        {
          error: "No valid staff records",
          details:
            errors.length > 0
              ? errors.join("; ")
              : "All staff records are missing required fields (leave_plan_request_id or user_id)",
          staffValidationErrors: errors,
          staffCount: staffList.length,
        },
        { status: 400 },
      )
    }

    // Insert all memo records
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert(memoRecords)
      .select("id, assigned_signers, staff_name, status")

    if (error) {
      console.error("[v0] Error saving memos:", error)
      return NextResponse.json(
        { error: "Failed to save memos", details: error.message },
        { status: 500 }
      )
    }

    console.log("[v0] Memos saved successfully:", {
      recordCount: data?.length || 0,
      samples: data?.slice(0, 3).map(m => ({
        id: m.id,
        staff: m.staff_name,
        assigned_signers: m.assigned_signers,
        status: m.status,
      }))
    })
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
