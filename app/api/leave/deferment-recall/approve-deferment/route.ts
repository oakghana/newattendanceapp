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
    const { deferment_id, decision, decision_note, selected_signer_id } = body

    if (!deferment_id || !decision) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get deferment request details
    const { data: deferment, error: deferErr } = await admin
      .from("leave_deferment_requests")
      .select("*")
      .eq("id", deferment_id)
      .single()

    if (deferErr || !deferment) {
      return NextResponse.json({ error: "Deferment not found" }, { status: 404 })
    }

    // Get staff info
    const { data: staff } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, position, department_id")
      .eq("id", deferment.user_id)
      .single()

    // Get leave plan request info
    const { data: leaveRequest } = await admin
      .from("leave_plan_requests")
      .select("id, leave_type_key, preferred_start_date, preferred_end_date, requested_days")
      .eq("id", deferment.leave_plan_request_id)
      .single()

    // Get signer info (HR executive who will sign)
    let signerData = null
    let signerSignatureUrl = ""
    
    if (selected_signer_id) {
      const { data: signer } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position")
        .eq("id", selected_signer_id)
        .single()

      if (signer) {
        signerData = signer
        
        // Get signer's signature from approval_signature_registry
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

    // Generate memo body
    const memoBody = {
      deferment_id,
      staff_name: staff ? `${staff.first_name} ${staff.last_name}` : "Unknown",
      staff_position: staff?.position || "Staff Member",
      leave_type: leaveRequest?.leave_type_key || "Annual Leave",
      original_start_date: leaveRequest?.preferred_start_date,
      original_end_date: leaveRequest?.preferred_end_date,
      requested_days: leaveRequest?.requested_days,
      deferment_reason: deferment.reason,
      deferred_to_year: deferment.requested_deferment_year,
      deferred_to_period: deferment.requested_deferment_period,
      selectedSigner: signerData ? {
        id: signerData.id,
        name: `${signerData.first_name} ${signerData.last_name}`,
        position: signerData.position,
        signature_data_url: signerSignatureUrl,
      } : null,
    }

    // Create memo record in deferment_memos table
    const { data: memo, error: memoErr } = await admin
      .from("deferment_memos")
      .insert({
        deferment_request_id: deferment_id,
        staff_id: deferment.user_id,
        hod_id: deferment.hod_reviewed_by,
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
      console.error("[v0] Error creating deferment memo:", memoErr)
      return NextResponse.json({ error: "Failed to create memo" }, { status: 500 })
    }

    // Update deferment request status
    const { error: updateErr } = await admin
      .from("leave_deferment_requests")
      .update({
        hr_office_decision: decision,
        hr_office_decision_note: decision_note,
        hr_office_reviewed_by: user.id,
        hr_office_reviewed_at: new Date().toISOString(),
        status: decision === "approved" ? "approved" : "rejected",
      })
      .eq("id", deferment_id)

    if (updateErr) {
      console.error("[v0] Error updating deferment status:", updateErr)
      return NextResponse.json({ error: "Failed to update deferment status" }, { status: 500 })
    }

    // Distribute memo to staff and HOD
    if (memo) {
      // To Staff
      await admin
        .from("deferment_memo_distributions")
        .insert({
          deferment_memo_id: memo.id,
          recipient_id: deferment.user_id,
          recipient_role: "staff",
          created_at: new Date().toISOString(),
        })
        .select()

      // To HOD if different
      if (deferment.hod_reviewed_by && deferment.hod_reviewed_by !== deferment.user_id) {
        await admin
          .from("deferment_memo_distributions")
          .insert({
            deferment_memo_id: memo.id,
            recipient_id: deferment.hod_reviewed_by,
            recipient_role: "hod",
            created_at: new Date().toISOString(),
          })
          .select()
      }

      // To HR Signer
      if (selected_signer_id) {
        await admin
          .from("deferment_memo_distributions")
          .insert({
            deferment_memo_id: memo.id,
            recipient_id: selected_signer_id,
            recipient_role: "hr_signer",
            created_at: new Date().toISOString(),
          })
          .select()
      }
    }

    return NextResponse.json({
      success: true,
      message: `Deferment ${decision === "approved" ? "approved" : "rejected"} successfully`,
      memo_id: memo?.id,
      deferment_id,
    })
  } catch (error) {
    console.error("[v0] Error in approve-deferment:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
