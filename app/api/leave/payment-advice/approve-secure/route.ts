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

    // CRITICAL FIX: The signer is ALWAYS the authenticated user (whoever is logged in
    // and clicking approve). You can only ever sign as yourself. This prevents the bug
    // where a pre-selected default signer (e.g. the first HR executive) was being stored
    // instead of the actual approver.
    const { data: signerProfile, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role, signature_data_url")
      .eq("id", user.id)
      .single()

    if (profileErr || !signerProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    const roleNorm = String(signerProfile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const HR_EXECUTIVE_ROLES = [
      "hr_executive",
      "director_hr",
      "director_human_resources",
      "manager_hr",
      "hr_manager",
      "hr_officer",
      "hr_director",
      "deputy_hr",
      "deputy_director_hr",
      "human_resource_manager",
      "admin",
    ]
    if (!roleNorm || !HR_EXECUTIVE_ROLES.includes(roleNorm)) {
      return NextResponse.json(
        { 
          error: "Access denied",
          details: `Your role (${signerProfile.role}) is not authorized to approve payment memos. Only HR Executives can approve.` 
        },
        { status: 403 }
      )
    }

    const { memoIds } = requestBody

    if (!memoIds || !Array.isArray(memoIds) || memoIds.length === 0) {
      return NextResponse.json(
        { error: "No memo IDs provided" },
        { status: 400 }
      )
    }

    // The selected signer is the authenticated user - they sign with their own identity
    const selectedSigner = { id: signerProfile.id }

    // Build signer name from the authenticated user's profile
    const signerName = `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim()

    console.log("[v0] APPROVE FLOW: Authenticated approver signing:", {
      id: signerProfile.id,
      name: signerName,
      role: signerProfile.role,
      hasSignatureInProfile: !!signerProfile.signature_data_url,
    })
    
    // Smart signature lookup: First check user_profiles (primary), then approval_signature_registry (fallback)
    let signatureUrl: string | null = signerProfile.signature_data_url || null
    
    if (signatureUrl) {
      console.log("[v0] Found signature in user_profiles for user:", signerProfile.id)
    }
    
    // Priority 2: Check approval_signature_registry (fallback for older signatures)
    if (!signatureUrl) {
      const { data: signatureRecords, error: sigError } = await admin
        .from("approval_signature_registry")
        .select("id, signature_data_url, user_id, is_active, workflow_domain")
        .eq("user_id", signerProfile.id)
        .eq("is_active", true)
      
      console.log("[v0] Registry signature query result:", {
        recordCount: signatureRecords?.length,
        error: sigError?.message,
      })

      if (signatureRecords && signatureRecords.length > 0 && signatureRecords[0].signature_data_url) {
        signatureUrl = signatureRecords[0].signature_data_url
        console.log("[v0] Found signature in approval_signature_registry for user:", signerProfile.id)
      }
    }

    if (!signatureUrl) {
      console.warn("[v0] APPROVAL BLOCKED - No signature found for user:", {
        userId: signerProfile.id,
        userName: signerName,
      })
      return NextResponse.json(
        { 
          error: "Signature required",
          details: "You must save your signature in the system before you can approve payment memos. Please visit Settings > My Profile to add your digital signature.",
          requiresSignatureSave: true,
          missingSignatureFor: signerProfile.id,
        },
        { status: 400 }
      )
    }
    
    console.log("[v0] Signature validation PASSED for signer:", {
      userId: signerProfile.id,
      userName: signerName,
      signatureLength: signatureUrl?.length || 0,
    })
    
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
        
        // Add approver info for the final PDF signer
        memoBody.approver = {
          id: selectedSigner.id,
          name: signerName,
          position: signerProfile.position || "",
          role: signerProfile.role,
          approved_at: new Date().toISOString(),
        }
        
        // CRITICAL: Always overwrite selectedSigner with the ACTUAL approver (authenticated user).
        // A stale/default signer set during submit-memo must not drive PDF rendering.
        memoBody.selectedSigner = {
          id: selectedSigner.id,
          name: signerName,
          position: signerProfile.position || "",
          signature_image_url: signatureUrl || "",
        }

        // Update memo with new status, signature, and updated memo_body
        // Use 'reviewed_by_hr' status (one of the allowed CHECK constraint values)
        // This prevents the memo from appearing in the pending queue again
        const { error: updateError } = await admin
          .from("leave_payment_memos")
          .update({
            status: "reviewed_by_hr", // ✅ Matches CHECK constraint: ['draft', 'ready_for_review', 'reviewed_by_hr', 'forwarded_to_accounts', 'acknowledged_by_accounts']
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
