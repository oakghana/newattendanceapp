import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildHologramCode, isHrDepartment } from "@/lib/leave-planning"
import { computeReturnToWorkDate } from "@/lib/leave-policy"

function isSchemaIssue(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "").toLowerCase()
  return code === "PGRST205" || code === "PGRST108" || code === "42P01" || code === "42703" || message.includes("does not exist")
}

function schemaIssueResponse() {
  return NextResponse.json(
    {
      error:
        "Leave planning tables are not visible in API schema cache. Run scripts 038_leave_planning_2026_2027_workflow.sql and 039_leave_policy_catalog.sql, then reload Supabase API schema cache.",
      needsMigration: true,
      needsSchemaCacheRefresh: true,
    },
    { status: 503 },
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError && isSchemaIssue(profileError)) {
      return schemaIssueResponse()
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")

    const isHr =
      role === "admin" ||
      role === "hr" ||
      (role === "department_head" &&
        isHrDepartment((profile as any)?.departments?.name, (profile as any)?.departments?.code))

    if (!isHr) {
      return NextResponse.json({ error: "Only HR department head (or admin) can finalize stagger requests." }, { status: 403 })
    }

    const body = await request.json()
    const {
      leave_plan_stagger_request_id,
      action,
      hr_response_letter,
      hr_signature_mode,
      hr_signature_text,
      hr_signature_image_url,
      hr_signature_data_url,
    } = body

    if (!leave_plan_stagger_request_id || !action) {
      return NextResponse.json({ error: "leave_plan_stagger_request_id and action are required." }, { status: 400 })
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use approve or reject." }, { status: 400 })
    }

    if (!hr_signature_text && !hr_signature_image_url && !hr_signature_data_url) {
      return NextResponse.json({ error: "HR signature is required." }, { status: 400 })
    }

    const { data: stagger, error: staggerError } = await supabase
      .from("leave_plan_stagger_requests")
      .select("id, user_id, leave_plan_request_id, requested_start_date, requested_end_date, reason, status")
      .eq("id", leave_plan_stagger_request_id)
      .single()

    if (staggerError && isSchemaIssue(staggerError)) {
      return schemaIssueResponse()
    }

    if (staggerError || !stagger) {
      return NextResponse.json({ error: "Stagger request not found." }, { status: 404 })
    }

    if (stagger.status !== "manager_confirmed") {
      return NextResponse.json(
        { error: "Only manager-confirmed stagger requests can be finalized by HR." },
        { status: 400 },
      )
    }

    const finalStatus = action === "approve" ? "hr_approved" : "hr_rejected"

    const { error: updateError } = await supabase
      .from("leave_plan_stagger_requests")
      .update({
        status: finalStatus,
        hr_response_letter: hr_response_letter || null,
        hr_signature_mode: hr_signature_mode || "typed",
        hr_signature_text: hr_signature_text || null,
        hr_signature_image_url: hr_signature_image_url || null,
        hr_signature_data_url: hr_signature_data_url || null,
        hr_signature_hologram_code: buildHologramCode("HR"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave_plan_stagger_request_id)

    if (updateError) {
      if (isSchemaIssue(updateError)) {
        return schemaIssueResponse()
      }
      throw updateError
    }

    if (finalStatus === "hr_approved") {
      try {
        const start = new Date(stagger.requested_start_date)
        const end = new Date(stagger.requested_end_date)
        const dates: string[] = []
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(new Date(d).toISOString().split("T")[0])
        }

        const rows = dates.map((dt) => ({
          user_id: stagger.user_id,
          date: dt,
          status: "on_leave",
          leave_request_id: stagger.leave_plan_request_id,
        }))

        const { error: leaveStatusError } = await supabase.from("leave_status").upsert(rows)
        if (leaveStatusError) {
          console.error("[v0] Failed to upsert leave_status for approved stagger request:", leaveStatusError)
        }

        const today = new Date().toISOString().split("T")[0]
        const effectiveStatus =
          today >= stagger.requested_start_date && today <= stagger.requested_end_date ? "on_leave" : "active"

        const { error: profileUpdateError } = await supabase
          .from("user_profiles")
          .update({
            leave_status: effectiveStatus,
            leave_start_date: stagger.requested_start_date,
            leave_end_date: stagger.requested_end_date,
            leave_reason: stagger.reason || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", stagger.user_id)

        if (profileUpdateError) {
          console.error("[v0] Failed to update user_profiles leave fields for approved stagger request:", profileUpdateError)
        }
      } catch (err) {
        console.error("[v0] Error synchronizing approved stagger request to leave status:", err)
      }
    }

    await supabase.from("staff_notifications").insert({
      recipient_id: stagger.user_id,
      type: "leave_plan_stagger_final_status",
      title: finalStatus === "hr_approved" ? "Stagger Request Approved" : "Stagger Request Rejected",
      message:
        finalStatus === "hr_approved"
          ? `Your stagger leave request has been approved by HR. Return-to-work date: ${computeReturnToWorkDate(stagger.requested_end_date)}.`
          : "Your stagger leave request has been rejected by HR. Please check the response letter.",
      data: {
        leave_plan_stagger_request_id,
        status: finalStatus,
      },
      is_read: false,
    })

    return NextResponse.json({ success: true, status: finalStatus })
  } catch (error) {
    if (isSchemaIssue(error)) {
      return schemaIssueResponse()
    }
    console.error("[v0] Stagger HR finalize error:", error)
    return NextResponse.json({ error: "Failed to finalize stagger leave request." }, { status: 500 })
  }
}
