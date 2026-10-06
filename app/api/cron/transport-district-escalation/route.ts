import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function authorized(request: NextRequest) {
  const configuredKey = process.env.CRON_API_KEY
  if (!configuredKey) return process.env.NODE_ENV !== "production"
  return request.headers.get("x-api-key") === configuredKey || request.headers.get("authorization") === `Bearer ${configuredKey}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createAdminClient()
  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString()
  const { data: requests, error } = await admin
    .from("transport_requests")
    .select("id, requester_id, purpose, origin, destination, regional_route, workflow_stage, updated_at, created_at")
    .in("workflow_stage", ["district_officer_review", "regional_hr_review"])
    .lt("updated_at", cutoff)
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!requests?.length) return NextResponse.json({ ok: true, escalated: 0 })

  const now = new Date().toISOString()
  const districtRequests = requests.filter((request) => request.workflow_stage === "district_officer_review")
  const regionalHrRequests = requests.filter((request) => request.workflow_stage === "regional_hr_review")
  const updatedRows: Array<{ id: string; requester_id: string | null; purpose: string | null; from_stage: string; to_stage: string }> = []

  if (districtRequests.length) {
    const headOfficeIds = districtRequests.filter((request) => request.regional_route === "head_office").map((request) => request.id)
    const regionalIds = districtRequests.filter((request) => request.regional_route !== "head_office").map((request) => request.id)
    if (regionalIds.length) {
      const { data: updated, error: updateError } = await admin
        .from("transport_requests")
        .update({ status: "pending_regional_hr_review", workflow_stage: "regional_hr_review", updated_at: now })
        .in("id", regionalIds)
        .eq("workflow_stage", "district_officer_review")
        .select("id, requester_id, purpose")
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      updatedRows.push(...(updated ?? []).map((row) => ({ ...row, from_stage: "district_officer_review", to_stage: "regional_hr_review" })))
    }
    if (headOfficeIds.length) {
      const { data: updated, error: updateError } = await admin
        .from("transport_requests")
        .update({ status: "pending_md_approval", workflow_stage: "managing_director_approval", updated_at: now })
        .in("id", headOfficeIds)
        .eq("workflow_stage", "district_officer_review")
        .select("id, requester_id, purpose")
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      updatedRows.push(...(updated ?? []).map((row) => ({ ...row, from_stage: "district_officer_review", to_stage: "managing_director_approval" })))
    }
  }

  if (regionalHrRequests.length) {
    const { data: updated, error: updateError } = await admin
      .from("transport_requests")
      .update({ status: "pending_manager_review", workflow_stage: "regional_manager_endorsement", updated_at: now })
      .in("id", regionalHrRequests.map((request) => request.id))
      .eq("workflow_stage", "regional_hr_review")
      .select("id, requester_id, purpose")
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    updatedRows.push(...(updated ?? []).map((row) => ({ ...row, from_stage: "regional_hr_review", to_stage: "regional_manager_endorsement" })))
  }

  if (updatedRows.length) {
    await admin.from("transport_request_events").insert(updatedRows.map((request) => ({
      request_id: request.id,
      actor_id: null,
      action: request.to_stage === "managing_director_approval" ? "transport_hod_auto_forwarded_to_md" : "transport_review_auto_escalated",
      from_stage: request.from_stage,
      to_stage: request.to_stage,
      comment: "Automatically escalated after the current reviewer action window expired.",
    })))

    const mdIds = updatedRows.filter((request) => request.to_stage === "managing_director_approval").map((request) => request.id)
    const rmIds = updatedRows.filter((request) => request.to_stage === "regional_manager_endorsement").map((request) => request.id)
    const notify = async (roles: string[], ids: string[], type: string, message: string) => {
      if (!ids.length) return
      const { data: recipients } = await admin.from("user_profiles").select("id").in("role", roles).eq("is_active", true)
      if (!recipients?.length) return
      await admin.from("staff_notifications").insert(recipients.flatMap((recipient) => ids.map((id) => ({
        recipient_id: recipient.id, notification_type: type, message: `${message} (${id})`, is_read: false, created_at: now,
      }))))
    }
    await notify(["managing_director"], mdIds, "transport_pending_md", "Transport request automatically forwarded for Managing Director endorsement")
    await notify(["regional_manager", "regional manager"], rmIds, "transport_pending_rm", "Transport request automatically forwarded for Regional Manager endorsement")
  }

  return NextResponse.json({ ok: true, escalated: updatedRows.length })
}

export const dynamic = "force-dynamic"
export const maxDuration = 60
