import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch a user's saved signature for auto-population
 * 
 * This endpoint retrieves the saved signature from approval_signature_registry
 * so it can be auto-populated when signing documents (payment memos, loan approvals, leave memos)
 * 
 * Query params:
 * - userId: Optional. If not provided, returns current user's signature
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get optional userId from query params (for HR checking another signer's signature)
    const searchParams = request.nextUrl.searchParams
    const targetUserId = searchParams.get("userId") || user.id

    // Fetch user profile for name, position AND primary signature storage
    const { data: userProfile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role, email, signature_data_url")
      .eq("id", targetUserId)
      .maybeSingle()

    if (profileError) {
      console.error("[v0] Error fetching user profile:", profileError)
    }

    const signerName = userProfile
      ? `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim()
      : "Unknown"

    // Priority 1: user_profiles.signature_data_url (set via Profile Settings > Signature)
    let resolvedSigDataUrl: string | null = (userProfile as any)?.signature_data_url?.trim() || null
    let signatureRecord: any = null

    if (resolvedSigDataUrl) {
      // Construct a synthetic record so the response shape stays the same
      signatureRecord = {
        id: targetUserId,
        signature_data_url: resolvedSigDataUrl,
        workflow_domain: "profile",
        approval_stage: "profile",
        created_at: null,
        updated_at: (userProfile as any)?.signature_updated_at || null,
      }
    } else {
      // Priority 2: approval_signature_registry (where hr-signature-save writes)
      const { data: registryRecord, error: sigError } = await admin
        .from("approval_signature_registry")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sigError && sigError.code !== "PGRST116") {
        console.error("[v0] Error fetching signature from registry:", sigError)
      }

      if (registryRecord?.signature_data_url) {
        resolvedSigDataUrl = registryRecord.signature_data_url
        signatureRecord = {
          id: registryRecord.id,
          signature_data_url: registryRecord.signature_data_url,
          signature_image_url: registryRecord.signature_data_url,
          workflow_domain: registryRecord.workflow_domain,
          approval_stage: registryRecord.approval_stage,
          created_at: registryRecord.created_at,
          updated_at: registryRecord.updated_at,
        }
      }
    }

    const hasSignature = !!resolvedSigDataUrl

    return NextResponse.json({
      success: true,
      hasSignature,
      signature: signatureRecord ? {
        ...signatureRecord,
        signature_data_url: resolvedSigDataUrl,
        signature_image_url: resolvedSigDataUrl,
      } : null,
      signer: userProfile ? {
        id: userProfile.id,
        name: signerName,
        position: userProfile.position,
        role: userProfile.role,
        email: userProfile.email,
      } : null,
    })
  } catch (err: any) {
    console.error("[v0] Error in auto-populate signature:", err.message || err)
    return NextResponse.json(
      { error: "Failed to fetch signature", details: err.message },
      { status: 500 }
    )
  }
}

/**
 * POST: Apply auto-populated signature to a document
 * 
 * This endpoint auto-applies the signer's saved signature to a memo/document
 * without requiring them to re-draw or re-upload their signature
 * 
 * Body:
 * - documentId: ID of the document to sign
 * - documentType: "payment_memo" | "loan_request" | "leave_memo" | "deferment_memo"
 * - signerId: Optional. ID of the signer (defaults to current user)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { documentId, documentType, signerId } = body

    if (!documentId || !documentType) {
      return NextResponse.json(
        { error: "Missing required fields: documentId and documentType" },
        { status: 400 }
      )
    }

    const targetSignerId = signerId || user.id

    // Verify user has permission to sign (must be an HR role for most documents)
    const { data: currentUserProfile } = await admin
      .from("user_profiles")
      .select("id, role, position")
      .eq("id", user.id)
      .single()

    const hrRoles = ["manager_hr", "director_hr", "hr_executive", "deputy_hr", "hr_manager", "hr_officer", "admin"]
    const isHrUser = currentUserProfile && hrRoles.includes(currentUserProfile.role)

    // Fetch the signer's saved signature
    const { data: signatureRecord, error: sigError } = await admin
      .from("approval_signature_registry")
      .select("*")
      .eq("user_id", targetSignerId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    if (sigError || !signatureRecord?.signature_data_url) {
      return NextResponse.json({
        error: "No saved signature found",
        details: "Please save your signature in Profile > Signature before signing documents",
        requiresSignatureSave: true,
      }, { status: 400 })
    }

    // Fetch signer profile
    const { data: signerProfile } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role")
      .eq("id", targetSignerId)
      .single()

    const signerName = signerProfile
      ? `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim()
      : "Unknown"

    // Apply signature based on document type
    let updateResult: any = null
    const signatureData = {
      signature_data_url: signatureRecord.signature_data_url,
      signer_id: targetSignerId,
      signer_name: signerName,
      signer_position: signerProfile?.position || "",
      signed_at: new Date().toISOString(),
    }

    switch (documentType) {
      case "payment_memo":
        // Update leave_payment_memos
        const { data: paymentMemo, error: pmError } = await admin
          .from("leave_payment_memos")
          .update({
            status: "reviewed_by_hr",
            ...signatureData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId)
          .select()
          .single()

        if (pmError) throw pmError
        updateResult = paymentMemo

        // Also update the linked leave_plan_request
        if (paymentMemo?.leave_plan_request_id) {
          await admin
            .from("leave_plan_requests")
            .update({
              hr_approver_name: signerName,
              hr_approver_id: targetSignerId,
              hr_approved_at: new Date().toISOString(),
              hr_signature_data_url: signatureRecord.signature_data_url,
            })
            .eq("id", paymentMemo.leave_plan_request_id)
        }
        break

      case "loan_request":
        // Update loan_requests with director signature
        const { data: loanRequest, error: lrError } = await admin
          .from("loan_requests")
          .update({
            director_signature_data_url: signatureRecord.signature_data_url,
            director_hr_id: targetSignerId,
            director_decision_at: new Date().toISOString(),
            director_note: `Signed by ${signerName}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId)
          .select()
          .single()

        if (lrError) throw lrError
        updateResult = loanRequest
        break

      case "leave_memo":
        // Update leave_plan_requests
        const { data: leaveRequest, error: leaveError } = await admin
          .from("leave_plan_requests")
          .update({
            hr_signature_data_url: signatureRecord.signature_data_url,
            hr_approver_id: targetSignerId,
            hr_approver_name: signerName,
            hr_approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId)
          .select()
          .single()

        if (leaveError) throw leaveError
        updateResult = leaveRequest
        break

      case "deferment_memo":
        // Update deferment_memos
        const { data: defermentMemo, error: dmError } = await admin
          .from("deferment_memos")
          .update({
            signature_image_url: signatureRecord.signature_data_url,
            hr_signer_id: targetSignerId,
            signer_name: signerName,
            signer_position: signerProfile?.position || "",
            status: "signed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId)
          .select()
          .single()

        if (dmError) throw dmError
        updateResult = defermentMemo
        break

      default:
        return NextResponse.json(
          { error: `Unsupported document type: ${documentType}` },
          { status: 400 }
        )
    }

    console.log("[v0] Auto-populated signature applied:", {
      documentType,
      documentId,
      signerId: targetSignerId,
      signerName,
    })

    return NextResponse.json({
      success: true,
      message: "Signature applied successfully",
      document: updateResult,
      signature: {
        url: signatureRecord.signature_data_url,
        signer: {
          id: targetSignerId,
          name: signerName,
          position: signerProfile?.position,
        },
        appliedAt: new Date().toISOString(),
      },
    })
  } catch (err: any) {
    console.error("[v0] Error applying auto-populated signature:", err.message || err)
    return NextResponse.json(
      { error: "Failed to apply signature", details: err.message },
      { status: 500 }
    )
  }
}
