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
    .select("id, requester_id, purpose, workflow_stage, updated_at, created_at")
    .eq("workflow_stage", "district_officer_review")
    .lt("updated_at", cutoff)
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!requests?.length) return NextResponse.json({ ok: true, escalated: 0 })

  const now = new Date().toISOString()
  const ids = requests.map((request) => request.id)
  const { data: updated, error: updateError } = await admin
    .from("transport_requests")
    .update({
      status: "pending_regional_hr_review",
      workflow_stage: "regional_hr_review",
      updated_at: now,
    })
    .in("id", ids)
    .eq("workflow_stage", "district_officer_review")
    .select("id, requester_id, purpose")

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await admin.from("transport_request_events").insert(
    (updated ?? []).map((request) => ({
      request_id: request.id,
      actor_id: null,
      action: "transport_district_officer_auto_endorsed",
      from_stage: "district_officer_review",
      to_stage: "regional_hr_review",
      comment: "Automatically endorsed after the District Officer action window expired.",
    })),
  )

  return NextResponse.json({ ok: true, escalated: updated?.length ?? 0 })
}

export const dynamic = "force-dynamic"
export const maxDuration = 60
