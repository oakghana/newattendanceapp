import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse, NextRequest } from "next/server"

// Dynamically import memo services to avoid build-time evaluation
const getMemoServices = async () => {
  const { generateDefermentMemo, generateRecallMemo } = await import("@/lib/deferment-recall-memo-service")
  const { distributeMemoToRecipients } = await import("@/lib/memo-distribution-service")
  return { generateDefermentMemo, generateRecallMemo, distributeMemoToRecipients }
}

/**
 * HR-exclusive endpoint for managing all deferment and recall requests
 * Only HR executives can access all pending requests for approval
 * This endpoint handles both viewing and approving requests
 * Auto-generates professional memos and distributes to staff/HOD on approval
 */

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const requestType = searchParams.get("type") || "deferment" // deferment | recall
    const status = searchParams.get("status") || "pending" // pending | approved | rejected

    // Get all pending/pending_hod_review deferment requests (not filtered by user)
    if (requestType === "deferment") {
      const statuses = status === "all" ? ["pending", "pending_hod_review", "approved", "rejected"] : [status]
      
      const { data: deferments, error: deferErr } = await admin
        .from("leave_deferment_requests")
        .select(`
          id,
          leave_plan_request_id,
          user_id,
          requested_deferment_year,
          requested_deferment_period,
          deferment_start_date,
          deferment_end_date,
          reason,
          status,
          hod_decision,
          hod_decision_note,
          hod_reviewed_at,
          hr_office_decision,
          hr_office_decision_note,
          hr_office_reviewed_at,
          created_at,
          updated_at,
          leave_plan_requests:leave_plan_request_id(
            id,
            user_id,
            user_profiles:user_id(
              id,
              first_name,
              last_name,
              email,
              employee_id,
              position,
              departments(name)
            )
          )
        `)
        .in("status", statuses)
        .order("created_at", { ascending: false })

      if (deferErr) {
        console.error("[v0] Error fetching deferments:", deferErr)
        return NextResponse.json({ error: "Failed to fetch deferments" }, { status: 500 })
      }

      return NextResponse.json({
        requests: deferments || [],
        type: "deferment",
        count: deferments?.length || 0,
      })
    }

    // Get all recall requests
    if (requestType === "recall") {
      const statuses = status === "all" ? ["pending", "approved", "rejected"] : [status]
      
      const { data: recalls, error: recallErr } = await admin
        .from("leave_recall_requests")
        .select(`
          id,
          leave_plan_request_id,
          staff_user_id,
          initiated_by_user_id,
          recall_date,
          recall_reason,
          recall_notes,
          status,
          hr_decision,
          hr_decision_note,
          hr_reviewed_at,
          staff_acknowledged,
          staff_acknowledged_at,
          created_at,
          updated_at,
          leave_plan_requests:leave_plan_request_id(
            id,
            user_id,
            user_profiles:user_id(
              id,
              first_name,
              last_name,
              email,
              employee_id,
              position,
              departments(name)
            )
          )
        `)
        .in("status", statuses)
        .order("created_at", { ascending: false })

      if (recallErr) {
        console.error("[v0] Error fetching recalls:", recallErr)
        return NextResponse.json({ error: "Failed to fetch recalls" }, { status: 500 })
      }

      return NextResponse.json({
        requests: recalls || [],
        type: "recall",
        count: recalls?.length || 0,
      })
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Error in HR deferment/recall management API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST: Approve/Reject a deferment or recall request and auto-generate memos
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    // Dynamically import memo services at runtime
    const { generateDefermentMemo, generateRecallMemo, distributeMemoToRecipients } = await getMemoServices()
    
    const body = await request.json()
    
    const {
      requestId,
      requestType, // "deferment" | "recall"
      decision, // "approved" | "rejected"
      decisionNote,
      approverUserId,
    } = body

    if (!requestId || !requestType || !decision || !approverUserId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (requestType === "deferment") {
      // Update deferment request
      const { data: updated, error: updateErr } = await admin
        .from("leave_deferment_requests")
        .update({
          hr_office_decision: decision,
          hr_office_decision_note: decisionNote,
          hr_office_reviewed_at: new Date().toISOString(),
          hr_office_reviewed_by: approverUserId,
          status: decision === "approved" ? "approved" : "rejected",
        })
        .eq("id", requestId)
        .select()
        .single()

      if (updateErr) {
        console.error("[v0] Error updating deferment:", updateErr)
        return NextResponse.json({ error: "Failed to update deferment" }, { status: 500 })
      }

      // If approved, auto-generate deferment memo
      if (decision === "approved" && updated) {
        try {
          console.log("[v0] Auto-generating deferment memo for:", requestId)
          
          // Get full deferment request data with staff info
          const { data: fullDeferment } = await admin
            .from("leave_deferment_requests")
            .select(`
              id,
              user_id,
              leave_plan_request_id,
              deferment_start_date,
              deferment_end_date,
              reason,
              leave_plan_requests!inner(
                user_id,
                leave_type_key,
                user_profiles:user_id(
                  first_name,
                  last_name,
                  email,
                  employee_id,
                  position,
                  departments(name)
                )
              )
            `)
            .eq("id", requestId)
            .single()

          if (fullDeferment) {
            // Get HR signer details first so we can pass into generateDefermentMemo
            const { data: signerProfileEarly } = await admin
              .from("user_profiles")
              .select("id, first_name, last_name, position")
              .eq("id", approverUserId)
              .single()

            const { data: signerSigEarly } = await admin
              .from("approval_signature_registry")
              .select("signature_image_url")
              .eq("user_id", approverUserId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .single()

            const staffProfile = (fullDeferment.leave_plan_requests as any)?.user_profiles
            const memoData = await generateDefermentMemo({
              staff: {
                name: staffProfile ? `${staffProfile.first_name} ${staffProfile.last_name}` : 'Unknown',
                position: staffProfile?.position || '',
                department: staffProfile?.departments?.[0]?.name || staffProfile?.departments?.name || '',
                employee_id: staffProfile?.employee_id || '',
              },
              originalLeaveStart: (fullDeferment.leave_plan_requests as any)?.preferred_start_date || '',
              originalLeaveEnd: (fullDeferment.leave_plan_requests as any)?.preferred_end_date || '',
              deferredStart: fullDeferment.deferment_start_date || '',
              deferredEnd: fullDeferment.deferment_end_date || '',
              reason: fullDeferment.reason || '',
              generatedDate: new Date().toLocaleDateString('en-GB'),
              signerName: `${signerProfileEarly?.first_name || ''} ${signerProfileEarly?.last_name || ''}`.trim() || 'HR Executive',
              signerPosition: signerProfileEarly?.position || 'HR EXECUTIVE',
              signatureImageUrl: signerSigEarly?.signature_image_url,
            })

            // Get HR signer info and signature
            const { data: signerProfile } = await admin
              .from("user_profiles")
              .select("id, first_name, last_name, position")
              .eq("id", approverUserId)
              .single()

            const { data: signerSignature } = await admin
              .from("approval_signature_registry")
              .select("signature_image_url, signature_data_url")
              .eq("user_id", approverUserId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .single()

            // Create deferment memo record
            const { data: createdMemo, error: memoErr } = await admin
              .from("deferment_memos")
              .insert({
                deferment_request_id: requestId,
                staff_id: fullDeferment.user_id,
                hr_signer_id: approverUserId,
                memo_body: JSON.stringify(memoData),
                signer_name: `${signerProfile?.first_name} ${signerProfile?.last_name}`,
                signer_position: signerProfile?.position || "HR EXECUTIVE",
                signature_image_url: signerSignature?.signature_image_url,
                status: "pending"
              })
              .select()
              .single()

            if (!memoErr && createdMemo) {
              // Distribute memo to staff and HOD
              await distributeMemoToRecipients({
                memoType: "deferment",
                memoId: createdMemo.id,
                staffId: fullDeferment.user_id,
                hodId: updated.hod_reviewed_by, // HOD who reviewed it
                memoData,
                signatureImageUrl: signerSignature?.signature_image_url
              })

              console.log("[v0] Deferment memo generated and distributed successfully")
            }
          }
        } catch (memoError) {
          console.error("[v0] Error generating/distributing deferment memo:", memoError)
          // Don't fail the entire request if memo generation fails
        }
      }

      return NextResponse.json({
        success: true,
        request: updated,
        message: `Deferment request ${decision}`,
      })
    }

    if (requestType === "recall") {
      // Update recall request
      const { data: updated, error: updateErr } = await admin
        .from("leave_recall_requests")
        .update({
          hr_decision: decision,
          hr_decision_note: decisionNote,
          hr_reviewed_at: new Date().toISOString(),
          hr_reviewed_by: approverUserId,
          status: decision === "approved" ? "approved" : "rejected",
        })
        .eq("id", requestId)
        .select()
        .single()

      if (updateErr) {
        console.error("[v0] Error updating recall:", updateErr)
        return NextResponse.json({ error: "Failed to update recall" }, { status: 500 })
      }

      // If approved, auto-generate recall memo
      if (decision === "approved" && updated) {
        try {
          console.log("[v0] Auto-generating recall memo for:", requestId)
          
          // Get full recall request data with staff info
          const { data: fullRecall } = await admin
            .from("leave_recall_requests")
            .select(`
              id,
              staff_user_id,
              leave_plan_request_id,
              recall_date,
              recall_reason,
              leave_plan_requests!inner(
                user_id,
                leave_type_key,
                user_profiles:user_id(
                  first_name,
                  last_name,
                  email,
                  employee_id,
                  position,
                  departments(name)
                )
              )
            `)
            .eq("id", requestId)
            .single()

          if (fullRecall) {
            // Get HR signer info and signature upfront
            const { data: signerProfile } = await admin
              .from("user_profiles")
              .select("id, first_name, last_name, position")
              .eq("id", approverUserId)
              .single()

            const { data: signerSignature } = await admin
              .from("approval_signature_registry")
              .select("signature_image_url, signature_data_url")
              .eq("user_id", approverUserId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .single()

            const recallStaffProfile = (fullRecall.leave_plan_requests as any)?.user_profiles
            const memoData = await generateRecallMemo({
              staff: {
                name: recallStaffProfile ? `${recallStaffProfile.first_name} ${recallStaffProfile.last_name}` : 'Unknown',
                position: recallStaffProfile?.position || '',
                department: recallStaffProfile?.departments?.[0]?.name || recallStaffProfile?.departments?.name || '',
                employee_id: recallStaffProfile?.employee_id || '',
              },
              recallDate: fullRecall.recall_date || '',
              originalLeaveEnd: (fullRecall.leave_plan_requests as any)?.preferred_end_date || '',
              reason: fullRecall.recall_reason || '',
              generatedDate: new Date().toLocaleDateString('en-GB'),
              signerName: `${signerProfile?.first_name || ''} ${signerProfile?.last_name || ''}`.trim() || 'HR Executive',
              signerPosition: signerProfile?.position || 'HR EXECUTIVE',
              signatureImageUrl: signerSignature?.signature_image_url,
            })

            // Create recall memo record
            const { data: createdMemo, error: memoErr } = await admin
              .from("recall_memos")
              .insert({
                recall_request_id: requestId,
                staff_id: fullRecall.staff_user_id,
                hr_signer_id: approverUserId,
                memo_body: JSON.stringify(memoData),
                signer_name: `${signerProfile?.first_name} ${signerProfile?.last_name}`,
                signer_position: signerProfile?.position || "HR EXECUTIVE",
                signature_image_url: signerSignature?.signature_image_url,
                status: "pending"
              })
              .select()
              .single()

            if (!memoErr && createdMemo) {
              // Distribute memo to staff
              await distributeMemoToRecipients({
                memoType: "recall",
                memoId: createdMemo.id,
                staffId: fullRecall.staff_user_id,
                memoData,
                signatureImageUrl: signerSignature?.signature_image_url
              })

              console.log("[v0] Recall memo generated and distributed successfully")
            }
          }
        } catch (memoError) {
          console.error("[v0] Error generating/distributing recall memo:", memoError)
          // Don't fail the entire request if memo generation fails
        }
      }

      return NextResponse.json({
        success: true,
        request: updated,
        message: `Recall request ${decision}`,
      })
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Error in HR deferment/recall POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
