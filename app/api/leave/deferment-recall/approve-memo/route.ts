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
    const {
      memo_id,
      memo_type, // 'deferment' or 'recall'
      decision, // 'approved' or 'rejected'
      signature_data_url,
      signature_text,
      signature_mode, // 'draw' or 'type'
      approval_notes,
      request_id
    } = body

    if (!memo_id || !memo_type || !decision || !request_id) {
      return NextResponse.json(
        { error: "Missing required fields: memo_id, memo_type, decision, request_id" },
        { status: 400 }
      )
    }

    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision. Must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }

    // Get user profile for signer info
    const { data: signerProfile } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, department_id, departments(name)")
      .eq("id", user.id)
      .single()

    const signerName = signerProfile ? `${signerProfile.first_name} ${signerProfile.last_name}` : "Unknown"
    const signerPosition = signerProfile?.position || "HR Executive"

    // Update memo based on type
    if (memo_type === 'deferment') {
      // Get the memo details first
      const { data: defermentMemo } = await admin
        .from("deferment_memos")
        .select("*")
        .eq("id", memo_id)
        .single()

      if (!defermentMemo) {
        return NextResponse.json({ error: "Deferment memo not found" }, { status: 404 })
      }

      // Update memo with signature and approval
      const { error: memoUpdateErr } = await admin
        .from("deferment_memos")
        .update({
          status: decision === 'approved' ? 'approved' : 'rejected',
          signature_image_url: signature_data_url || null,
          signer_name: signerName,
          signer_position: signerPosition,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          memo_body: {
            ...defermentMemo.memo_body,
            approval_notes,
            signature_mode,
            signature_text: signature_mode === 'type' ? signature_text : null,
            approved_at: new Date().toISOString(),
            approved_by: signerName
          }
        })
        .eq("id", memo_id)

      if (memoUpdateErr) {
        console.error("[v0] Error updating deferment memo:", memoUpdateErr)
        return NextResponse.json({ error: "Failed to update memo" }, { status: 500 })
      }

      // Update deferment request
      const { error: defUpdateErr } = await admin
        .from("leave_deferment_requests")
        .update({
          hr_office_decision: decision,
          hr_office_decision_note: approval_notes,
          hr_office_reviewed_by: user.id,
          hr_office_reviewed_at: new Date().toISOString(),
          status: decision === 'approved' ? 'approved' : 'rejected'
        })
        .eq("id", request_id)

      if (defUpdateErr) {
        console.error("[v0] Error updating deferment request:", defUpdateErr)
      }

      // Create distribution records for approved memos
      if (decision === 'approved') {
        // Get deferment request for staff and HOD info
        const { data: defermentRequest } = await admin
          .from("leave_deferment_requests")
          .select("user_id, hod_reviewed_by")
          .eq("id", request_id)
          .single()

        if (defermentRequest) {
          // Distribute to staff
          await admin
            .from("deferment_memo_distributions")
            .insert({
              deferment_memo_id: memo_id,
              recipient_id: defermentRequest.user_id,
              recipient_role: "staff",
              created_at: new Date().toISOString()
            })

          // Distribute to HOD if different
          if (defermentRequest.hod_reviewed_by && defermentRequest.hod_reviewed_by !== defermentRequest.user_id) {
            await admin
              .from("deferment_memo_distributions")
              .insert({
                deferment_memo_id: memo_id,
                recipient_id: defermentRequest.hod_reviewed_by,
                recipient_role: "hod",
                created_at: new Date().toISOString()
              })
          }

          // Distribute to HR signer
          await admin
            .from("deferment_memo_distributions")
            .insert({
              deferment_memo_id: memo_id,
              recipient_id: user.id,
              recipient_role: "hr_signer",
              created_at: new Date().toISOString()
            })
        }
      }
    } else if (memo_type === 'recall') {
      // Get the memo details first
      const { data: recallMemo } = await admin
        .from("recall_memos")
        .select("*")
        .eq("id", memo_id)
        .single()

      if (!recallMemo) {
        return NextResponse.json({ error: "Recall memo not found" }, { status: 404 })
      }

      // Update memo with signature and approval
      const { error: memoUpdateErr } = await admin
        .from("recall_memos")
        .update({
          status: decision === 'approved' ? 'approved' : 'rejected',
          signature_image_url: signature_data_url || null,
          signer_name: signerName,
          signer_position: signerPosition,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          memo_body: {
            ...recallMemo.memo_body,
            approval_notes,
            signature_mode,
            signature_text: signature_mode === 'type' ? signature_text : null,
            approved_at: new Date().toISOString(),
            approved_by: signerName
          }
        })
        .eq("id", memo_id)

      if (memoUpdateErr) {
        console.error("[v0] Error updating recall memo:", memoUpdateErr)
        return NextResponse.json({ error: "Failed to update memo" }, { status: 500 })
      }

      // Update recall request
      const { error: recallUpdateErr } = await admin
        .from("leave_recall_requests")
        .update({
          hr_decision: decision,
          hr_decision_note: approval_notes,
          hr_reviewed_by: user.id,
          hr_reviewed_at: new Date().toISOString(),
          status: decision === 'approved' ? 'approved' : 'rejected'
        })
        .eq("id", request_id)

      if (recallUpdateErr) {
        console.error("[v0] Error updating recall request:", recallUpdateErr)
      }

      // Create distribution records for approved memos
      if (decision === 'approved') {
        // Get recall request for staff info
        const { data: recallRequest } = await admin
          .from("leave_recall_requests")
          .select("staff_user_id")
          .eq("id", request_id)
          .single()

        if (recallRequest) {
          // Distribute to staff
          await admin
            .from("recall_memo_distributions")
            .insert({
              recall_memo_id: memo_id,
              recipient_id: recallRequest.staff_user_id,
              recipient_role: "staff",
              created_at: new Date().toISOString()
            })

          // Distribute to HR signer
          await admin
            .from("recall_memo_distributions")
            .insert({
              recall_memo_id: memo_id,
              recipient_id: user.id,
              recipient_role: "hr_signer",
              created_at: new Date().toISOString()
            })
        }
      }
    } else {
      return NextResponse.json(
        { error: "Invalid memo_type. Must be 'deferment' or 'recall'" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Memo ${decision} successfully`,
      memo_id,
      request_id
    })
  } catch (error) {
    console.error("[v0] Error in approve-memo:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
