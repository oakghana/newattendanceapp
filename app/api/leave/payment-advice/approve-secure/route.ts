import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST: Approve and sign payment advice memos
 * STRICT VALIDATION: Only the assigned HR Executive signer can approve their assigned memos
 * This prevents unauthorized users from approving memos not assigned to them
 */
export async function POST(request: NextRequest) {
  try {
    let requestBody: any
    try {
      requestBody = await request.json()
    } catch (parseErr: any) {
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

    // Verify user is an HR Executive
    const { data: userProfile, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role")
      .eq("id", user.id)
      .single()

    if (profileErr || !userProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    const hrRoles = ["manager_hr", "director_hr", "hr_executive", "deputy_hr"]
    if (!hrRoles.includes(userProfile.role)) {
      return NextResponse.json(
        { 
          error: "Access denied",
          details: `Your role (${userProfile.role}) is not authorized to approve payment memos. Only HR Executives can approve.` 
        },
        { status: 403 }
      )
    }

    const { memoIds, selectedSigner } = requestBody

    if (!memoIds || !Array.isArray(memoIds) || memoIds.length === 0) {
      return NextResponse.json(
        { error: "No memo IDs provided" },
        { status: 400 }
      )
    }

    if (!selectedSigner || !selectedSigner.id) {
      return NextResponse.json(
        { error: "No HR Executive signer selected", details: "An HR Executive must be selected to approve memos" },
        { status: 400 }
      )
    }

    // Fetch the selected signer's profile to get their name and signature
    console.log("[v0] Fetching selected signer profile:", selectedSigner.id)
    const { data: signerProfile, error: signerProfileErr } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role")
      .eq("id", selectedSigner.id)
      .single()

    if (signerProfileErr || !signerProfile) {
      return NextResponse.json(
        { error: "Selected signer profile not found" },
        { status: 404 }
      )
    }

    // CRITICAL: Verify selected signer has HR Executive role
    const HR_EXECUTIVE_ROLES = ["hr_executive", "manager_hr", "director_hr", "hr_manager", "hr_officer", "hr_director", "manager", "deputy_hr"]
    if (!signerProfile.role || !HR_EXECUTIVE_ROLES.includes(signerProfile.role)) {
      console.warn("[v0] Non-HR Executive role attempted to sign memo:", {
        signerId: selectedSigner.id,
        signerRole: signerProfile.role,
        allowedRoles: HR_EXECUTIVE_ROLES,
      })
      return NextResponse.json(
        { 
          error: "Invalid signer role",
          details: `Only users with HR Executive roles can approve memos. Selected user has role: ${signerProfile.role}. Allowed roles: ${HR_EXECUTIVE_ROLES.join(", ")}`,
        },
        { status: 403 }
      )
    }

    // Build signer name from selected signer (NOT current user)
    const signerName = `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim()

    // CRITICAL: Verify signer has a saved signature before allowing approval
    console.log("[v0] Checking signature for selected signer:", selectedSigner.id, "- signerName:", signerName)
    
    // Verify that the CURRENT USER (the one approving) is authorized to approve
    // AND verify the selected signer is assigned to these memos
    const { data: memosToValidate } = await admin
      .from("leave_payment_memos")
      .select("id, assigned_signers")
      .in("id", memoIds)

    if (memosToValidate && memosToValidate.length > 0) {
      // Check if CURRENT USER is an assigned signer for ALL memos
      // The current user must be authorized, and they select the final signer
      // (which could be themselves or another HR executive if delegating)
      const unauthorizedMemos = memosToValidate.filter(memo => {
        const assignedSigners = Array.isArray(memo.assigned_signers) ? memo.assigned_signers : []
        // Current user (the one approving) must be in the assigned_signers list
        return !assignedSigners.includes(user.id)
      })

      if (unauthorizedMemos.length > 0) {
        console.warn("[v0] Unauthorized approval attempt:", {
          attemptingUserId: user.id,
          selectedSignerId: selectedSigner.id,
          unauthorizedMemoIds: unauthorizedMemos.map(m => m.id),
          assignedSignersForMemos: unauthorizedMemos.map(m => m.assigned_signers),
        })
        return NextResponse.json(
          {
            error: "You are not authorized to approve these memos",
            details: `You (user ${user.id}) are not assigned to approve ${unauthorizedMemos.length} of the selected memos. Only assigned signers can approve.`,
          },
          { status: 403 }
        )
      }
    }
    
    // Smart signature lookup: First check user_profiles (primary), then approval_signature_registry (fallback)
    let signatureUrl: string | null = null
    
    // Priority 1: Check user_profiles (where signatures are now saved permanently)
    const { data: profileSignature } = await admin
      .from("user_profiles")
      .select("signature_data_url")
      .eq("id", selectedSigner.id)
      .single()
    
    if (profileSignature?.signature_data_url) {
      signatureUrl = profileSignature.signature_data_url
      console.log("[v0] Found signature in user_profiles for user:", selectedSigner.id)
    }
    
    // Priority 2: Check approval_signature_registry (fallback for older signatures)
    if (!signatureUrl) {
      const { data: signatureRecords, error: sigError } = await admin
        .from("approval_signature_registry")
        .select("id, signature_data_url, user_id, is_active, workflow_domain")
        .eq("user_id", selectedSigner.id)
        .eq("is_active", true)
      
      console.log("[v0] Registry signature query result:", {
        recordCount: signatureRecords?.length,
        error: sigError?.message,
      })

      if (signatureRecords && signatureRecords.length > 0 && signatureRecords[0].signature_data_url) {
        signatureUrl = signatureRecords[0].signature_data_url
        console.log("[v0] Found signature in approval_signature_registry for user:", selectedSigner.id)
      }
    }

    if (!signatureUrl) {
      console.warn("[v0] No signature found for user:", {
        userId: user.id,
        userName: signerName,
      })
      return NextResponse.json(
        { 
          error: "Signature required",
          details: "You must save your signature in the system before you can approve payment memos. Please visit Settings > My Profile to upload your signature.",
          requiresSignatureSave: true,
        },
        { status: 400 }
      )
    }
    
    console.log("[v0] Signature validation passed for user:", user.id, "- signature found")

    // Update memos with approval and store approver info in memo_body
    
    // Fetch all memos to update their memo_body with approver info, ALSO get the leave_plan_request_id
    const { data: memosToUpdate } = await admin
      .from("leave_payment_memos")
      .select("id, memo_body, leave_plan_request_id")
      .in("id", memoIds)

    if (memosToUpdate && memosToUpdate.length > 0) {
      // Collect all leave_plan_request_ids to update
      const leaveRequestIds: string[] = []
      
      // Update each memo with approver information
      for (const memo of memosToUpdate) {
        const memoBody = typeof memo.memo_body === 'string' ? JSON.parse(memo.memo_body) : memo.memo_body
        
        // Preserve the original selectedSigner if it exists (set during submit-memo)
        // Add approver info for the final PDF signer
        memoBody.approver = {
          id: selectedSigner.id,
          name: signerName,
          position: signerProfile.position || "",
          role: signerProfile.role,
          approved_at: new Date().toISOString(),
        }
        
        // If selectedSigner not yet set, set it now (for initial approval flow)
        if (!memoBody.selectedSigner) {
          memoBody.selectedSigner = {
            id: selectedSigner.id,
            name: signerName,
            position: signerProfile.position || "",
            signature_image_url: signatureUrl || "",
          }
        }

        // Update memo with new status, signature, and updated memo_body
        // Use 'signed_by_hr_executive' to clearly indicate the memo has been signed and approved
        // This prevents the memo from appearing in the pending queue again
        const { error: updateError } = await admin
          .from("leave_payment_memos")
          .update({
            status: "signed_by_hr_executive",
            memo_body: JSON.stringify(memoBody),
            signature_data_url: signatureUrl || null, // Store signature in DB column for PDF rendering
            signer_id: selectedSigner.id,
            signer_name: signerName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", memo.id)

        // CRITICAL: Surface update failures instead of silently swallowing them.
        // Previously this error was ignored, so a failed update left memos stuck in "pending".
        if (updateError) {
          console.error("[v0] Failed to update memo during approval:", {
            memoId: memo.id,
            error: updateError.message,
          })
          return NextResponse.json(
            {
              error: "Failed to approve memo",
              details: `Could not update memo ${memo.id}: ${updateError.message}`,
            },
            { status: 500 },
          )
        }

        // Track the leave_plan_request_id so we can update it too
        if (memo.leave_plan_request_id) {
          leaveRequestIds.push(memo.leave_plan_request_id)
        }
      }
      
      // CRITICAL: Also update the leave_plan_requests with the selected signer's name
      // This ensures the PDF generation shows the correct signer, not a stale value
      if (leaveRequestIds.length > 0) {
        await admin
          .from("leave_plan_requests")
          .update({
            hr_approver_name: signerName,
            hr_approver_id: selectedSigner.id,
            hr_approved_at: new Date().toISOString(),
          })
          .in("id", leaveRequestIds)
        
        console.log("[v0] Updated leave_plan_requests with selected signer:", {
          signerName,
          signerId: selectedSigner.id,
          requestCount: leaveRequestIds.length,
        })
      }
    }

    console.log("[v0] Memos approved by selected HR Executive:", {
      signerName,
      signerId: selectedSigner.id,
      signerRole: signerProfile.role,
      memoCount: memoIds.length,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      approvedCount: memoIds.length,
      message: `${memoIds.length} memo(s) approved successfully`,
    })
  } catch (err: any) {
    console.error("[v0] Error in approve route:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
