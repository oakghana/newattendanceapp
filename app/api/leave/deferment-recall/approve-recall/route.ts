import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { recall_id, decision, decision_note } = body

    if (!recall_id || !decision) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // CRITICAL FIX: The signer is ALWAYS the authenticated user (the logged-in HR executive
    // who is approving). This prevents storing a stale/default signer.
    const selected_signer_id = user.id

    // Get recall request details
    const { data: recall, error: recallErr } = await admin
      .from("leave_recall_requests")
      .select("*")
      .eq("id", recall_id)
      .single()

    if (recallErr || !recall) {
      return NextResponse.json({ error: "Recall request not found" }, { status: 404 })
    }

    // Get staff info
    const { data: staff } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, position, department_id")
      .eq("id", recall.staff_user_id)
      .single()

    // Get leave plan request info
    const { data: leaveRequest } = await admin
      .from("leave_plan_requests")
      .select("id, leave_type_key, preferred_start_date, preferred_end_date, requested_days")
      .eq("id", recall.leave_plan_request_id)
      .single()

    // Get signer info (HR executive who will sign)
    let signerData = null
    let signerSignatureUrl = ""
    
    if (selected_signer_id) {
      const { data: signer } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, signature_data_url")
        .eq("id", selected_signer_id)
        .single()

      if (signer) {
        signerData = signer
        
        // Priority 1: signature stored on the user profile
        signerSignatureUrl = signer.signature_data_url || ""

        // Priority 2: fall back to approval_signature_registry
        if (!signerSignatureUrl) {
          const { data: sig } = await admin
            .from("approval_signature_registry")
            .select("signature_data_url")
            .eq("user_id", selected_signer_id)
            .eq("is_active", true)
            .limit(1)
            .single()

          signerSignatureUrl = sig?.signature_data_url || ""
        }
      }
    }

    // Generate memo body
    const memoBody = {
      recall_id,
      staff_name: staff ? `${staff.first_name} ${staff.last_name}` : "Unknown",
      staff_position: staff?.position || "Staff Member",
      leave_type: leaveRequest?.leave_type_key || "Annual Leave",
      original_start_date: leaveRequest?.preferred_start_date,
      original_end_date: leaveRequest?.preferred_end_date,
      requested_days: leaveRequest?.requested_days,
      recall_reason: recall.recall_reason,
      recall_date: recall.recall_date,
      recall_notes: recall.recall_notes,
      selectedSigner: signerData ? {
        id: signerData.id,
        name: `${signerData.first_name} ${signerData.last_name}`,
        position: signerData.position,
        signature_data_url: signerSignatureUrl,
      } : null,
    }

    // Create memo record in recall_memos table
    const { data: memo, error: memoErr } = await admin
      .from("recall_memos")
      .insert({
        recall_request_id: recall_id,
        staff_id: recall.staff_user_id,
        hr_signer_id: selected_signer_id,
        signer_name: signerData ? `${signerData.first_name} ${signerData.last_name}` : "To Be Determined",
        signer_position: signerData?.position || "HR Executive",
        signature_image_url: signerSignatureUrl,
        memo_body: memoBody,
        status: decision === "approved" ? "signed" : "draft",
        generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (memoErr) {
      console.error("[v0] Error creating recall memo:", memoErr)
      return NextResponse.json({ error: "Failed to create memo" }, { status: 500 })
    }

    // Update recall request status
    const { error: updateErr } = await admin
      .from("leave_recall_requests")
      .update({
        hr_decision: decision,
        hr_decision_note: decision_note,
        hr_reviewed_by: user.id,
        hr_reviewed_at: new Date().toISOString(),
        status: decision === "approved" ? "approved" : "rejected",
      })
      .eq("id", recall_id)

    if (updateErr) {
      console.error("[v0] Error updating recall status:", updateErr)
      return NextResponse.json({ error: "Failed to update recall status" }, { status: 500 })
    }

    // Distribute memo to staff and initiator
    if (memo) {
      // To Staff
      await admin
        .from("recall_memo_distributions")
        .insert({
          recall_memo_id: memo.id,
          recipient_id: recall.staff_user_id,
          recipient_role: "staff",
          created_at: new Date().toISOString(),
        })
        .select()

      // To Recall Initiator (HOD/RM) if different from staff
      if (recall.initiated_by_user_id && recall.initiated_by_user_id !== recall.staff_user_id) {
        await admin
          .from("recall_memo_distributions")
          .insert({
            recall_memo_id: memo.id,
            recipient_id: recall.initiated_by_user_id,
            recipient_role: "initiator",
            created_at: new Date().toISOString(),
          })
          .select()
      }

      // To HR Signer
      if (selected_signer_id) {
        await admin
          .from("recall_memo_distributions")
          .insert({
            recall_memo_id: memo.id,
            recipient_id: selected_signer_id,
            recipient_role: "hr_signer",
            created_at: new Date().toISOString(),
          })
          .select()
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recall ${decision === "approved" ? "approved" : "rejected"} successfully`,
      memo_id: memo?.id,
      recall_id,
    })
  } catch (error) {
    console.error("[v0] Error in approve-recall:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
