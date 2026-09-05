import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canManageTransport, canCreateTransportRequest, isAdminRole } from "@/lib/role-capabilities"
import { formatTransportEventAction } from "@/lib/transport-workflow"

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.is_active) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const canView =
    canManageTransport(profile.role) ||
    canCreateTransportRequest(profile.role) ||
    isAdminRole(profile.role) ||
    ["managing_director", "hr", "hr_executive", "manager_hr", "director_hr", "hr_records", "department_head", "driver"].includes(
      String(profile.role || "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    )
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const requestId = new URL(request.url).searchParams.get("requestId")?.trim()
  if (!requestId) return NextResponse.json({ error: "requestId is required." }, { status: 400 })

  const { data: events, error } = await supabase
    .from("transport_request_events")
    .select("id, action, from_stage, to_stage, comment, created_at, actor_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) {
    // Table may be missing on older DBs — return empty timeline, not a hard failure
    console.warn("[transport] events read:", error.message)
    return NextResponse.json({ events: [] })
  }

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))] as string[]
  const nameMap: Record<string, string> = {}
  if (actorIds.length) {
    const { data: actors } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name")
      .in("id", actorIds)
    for (const a of actors ?? []) {
      nameMap[a.id] = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Staff"
    }
  }

  return NextResponse.json({
    events: (events ?? []).map((e) => ({
      id: e.id,
      action: e.action,
      actionLabel: formatTransportEventAction(e.action),
      from_stage: e.from_stage,
      to_stage: e.to_stage,
      comment: e.comment,
      created_at: e.created_at,
      actor_id: e.actor_id,
      actor_name: e.actor_id ? nameMap[e.actor_id] || "Staff" : "System",
    })),
  })
}
