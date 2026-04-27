import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const ALLOWED_ATTEMPT_TYPES = new Set(["manual_checkin", "offpremises_checkin"])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const attemptType = String(body?.attemptType || "manual_checkin")
    const failureReason = String(body?.failureReason || "unknown")
    const failureMessage = String(body?.failureMessage || "")

    if (!ALLOWED_ATTEMPT_TYPES.has(attemptType)) {
      return NextResponse.json({ error: "Invalid attempt type" }, { status: 400 })
    }

    const {
      data: profile,
    } = await supabase
      .from("user_profiles")
      .select("employee_id, first_name, last_name, role, department_id, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    const payload = {
      attempt_type: attemptType,
      failure_reason: failureReason,
      failure_message: failureMessage,
      attempted_at: new Date().toISOString(),
      nearest_location_name: body?.nearestLocationName || null,
      nearest_location_distance_m: body?.nearestLocationDistanceM ?? null,
      latitude: body?.latitude ?? null,
      longitude: body?.longitude ?? null,
      accuracy: body?.accuracy ?? null,
      device_type: body?.deviceType || null,
      device_info: body?.deviceInfo || null,
      user_profile_snapshot: {
        employee_id: profile?.employee_id || null,
        full_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
        role: profile?.role || null,
        department_name: (profile as any)?.departments?.name || null,
        department_code: (profile as any)?.departments?.code || null,
      },
    }

    const clientIp =
      (request as any).ip ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: attemptType === "offpremises_checkin" ? "offpremises_checkin_failed" : "check_in_failed",
      table_name: "attendance_records",
      record_id: null,
      new_values: payload,
      ip_address: clientIp,
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to log check-in failure:", error)
    return NextResponse.json({ error: "Failed to log check-in failure" }, { status: 500 })
  }
}
