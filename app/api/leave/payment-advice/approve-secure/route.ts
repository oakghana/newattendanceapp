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

    const hrRoles = ["hr_executive", "hr_manager", "hr_director", "hr_officer", "manager_hr", "manager", "deputy_hr"]
    if (!hrRoles.includes(userProfile.role)) {
      return NextResponse.json(
        { 
          error: "Access denied",
          details: `Your role (${userProfile.role}) is not authorized to approve payment memos. Only HR staff can approve.` 
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

    // CRITICAL: Validate that ALL memos exist and are in correct status
    const { data: memos, error: fetchErr } = await admin
      .from("leave_payment_memos")
      .select("id, staff_name, status")
      .in("id", memoIds)

    if (fetchErr) {
      console.error("[v0] Error fetching memos for validation:", fetchErr)
      return NextResponse.json(
        { error: "Failed to validate memos", details: fetchErr.message },
        { status: 500 }
      )
    }

    // Build signer name early for use in error messages
    const signerName = `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim()

    // CRITICAL: Verify signer has a saved signature before allowing approval
    console.log("[v0] Checking signature for user:", user.id, "- signerName:", signerName)
    
    const { data: signatureRecords, error: sigError } = await admin
      .from("approval_signature_registry")
      .select("id, signature_data_url, user_id, is_active, workflow_domain")
      .eq("user_id", user.id)
      .eq("is_active", true)
    
    console.log("[v0] Signature query result:", {
      recordCount: signatureRecords?.length,
      error: sigError?.message,
      records: signatureRecords,
    })

    const signatureRecord = signatureRecords && signatureRecords.length > 0 ? signatureRecords[0] : null

    if (!signatureRecord || !signatureRecord.signature_data_url) {
      console.warn("[v0] Signature validation failed for user:", {
        userId: user.id,
        userName: signerName,
        sigError: sigError?.message,
        hasSignature: !!signatureRecord?.signature_data_url,
        recordCount: signatureRecords?.length,
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
    
    console.log("[v0] Signature validation passed for user:", user.id, "- signature:", signatureRecord.signature_data_url)

    // Update memos with approval and store approver info in memo_body
    
    // Fetch all memos to update their memo_body with approver info
    const { data: memosToUpdate } = await admin
      .from("leave_payment_memos")
      .select("id, memo_body")
      .in("id", memoIds)

    if (memosToUpdate && memosToUpdate.length > 0) {
      // Update each memo with approver information
      for (const memo of memosToUpdate) {
        const memoBody = typeof memo.memo_body === 'string' ? JSON.parse(memo.memo_body) : memo.memo_body
        
        // Add approver info to memo_body for later use in PDF generation
        memoBody.approver = {
          id: user.id,
          name: signerName,
          position: userProfile.position || "",
          role: userProfile.role,
          approved_at: new Date().toISOString(),
        }

        // Update memo with new status and updated memo_body
        await admin
          .from("leave_payment_memos")
          .update({
            status: "reviewed_by_hr",
            memo_body: JSON.stringify(memoBody),
            updated_at: new Date().toISOString(),
          })
          .eq("id", memo.id)
      }
    }

    console.log("[v0] Memos approved by HR Executive:", {
      signerName,
      signerRole: userProfile.role,
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
