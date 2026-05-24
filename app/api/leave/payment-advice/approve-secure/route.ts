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

    const hrRoles = ["hr_executive", "hr_manager", "hr_director", "hr_officer"]
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

    // CRITICAL: Validate that ALL memos are assigned to THIS user
    const { data: memos, error: fetchErr } = await admin
      .from("leave_payment_memos")
      .select("id, hr_executive_signer_id, staff_name, status")
      .in("id", memoIds)

    if (fetchErr) {
      console.error("[v0] Error fetching memos for validation:", fetchErr)
      return NextResponse.json(
        { error: "Failed to validate memos", details: fetchErr.message },
        { status: 500 }
      )
    }

    // Check that all memos are assigned to the current user
    const unauthorizedMemos = memos.filter((m) => m.hr_executive_signer_id !== user.id)
    if (unauthorizedMemos.length > 0) {
      console.warn("[v0] Unauthorized approval attempt:", {
        userId: user.id,
        attemptedMemoIds: memoIds,
        unauthorizedMemos: unauthorizedMemos.map((m) => ({ id: m.id, assignedTo: m.hr_executive_signer_id })),
      })
      return NextResponse.json(
        { 
          error: "Access denied",
          details: `You are not authorized to approve ${unauthorizedMemos.length} of these memo(s). Only the assigned signer can approve their memos.`,
          unauthorizedCount: unauthorizedMemos.length,
        },
        { status: 403 }
      )
    }

    // CRITICAL: Verify signer has a saved signature before allowing approval
    const { data: signatureRecord, error: sigError } = await admin
      .from("approval_signature_registry")
      .select("id, signature_image_url")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .single()

    if (sigError || !signatureRecord || !signatureRecord.signature_image_url) {
      console.warn("[v0] Signature validation failed for user:", {
        userId: user.id,
        userName: signerName,
        sigError: sigError?.message,
        hasSignature: !!signatureRecord?.signature_image_url,
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

    // Update memos with approval
    const signerName = `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim()
    const { error: updateErr } = await admin
      .from("leave_payment_memos")
      .update({
        status: "reviewed_by_hr",
        reviewed_by_hr_executive_id: user.id,
        reviewed_by_hr_executive_name: signerName,
        reviewed_by_hr_executive_at: new Date().toISOString(),
      })
      .in("id", memoIds)

    if (updateErr) {
      console.error("[v0] Error updating memo status:", updateErr)
      return NextResponse.json(
        { error: "Failed to approve memos", details: updateErr.message },
        { status: 500 }
      )
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
