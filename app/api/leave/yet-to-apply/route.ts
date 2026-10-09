import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { chunk, normalizeRole, resolveYetToApply, type YetToApplyScope } from "@/lib/yet-to-apply"

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const scope = (url.searchParams.get("scope") || "") as YetToApplyScope
    if (scope !== "regional" && scope !== "hod") {
      return NextResponse.json({ error: "scope must be 'regional' or 'hod'" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const resolution = await resolveYetToApply(admin, user.id, scope, url.searchParams.get("year"))
    if (!resolution.ok) return NextResponse.json({ error: resolution.error }, { status: resolution.status })

    const { year, staffRows, pending, lastRejectedStatus } = resolution

    const locationIds = Array.from(new Set(pending.map((row) => row.assigned_location_id).filter(Boolean).map(String)))
    const locationNames = new Map<string, string>()
    for (const part of chunk(locationIds)) {
      const { data: locations, error: locationsError } = await admin
        .from("geofence_locations")
        .select("id, name")
        .in("id", part)
      if (locationsError) throw locationsError
      for (const location of locations || []) locationNames.set(String(location.id), String(location.name || ""))
    }

    const staff = pending
      .map((row) => ({
        id: String(row.id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unknown",
        employee_id: row.employee_id || "",
        position: row.position || "",
        role: normalizeRole(row.role),
        email: row.email || "",
        department_name: row.departments?.name || "",
        location_name: locationNames.get(String(row.assigned_location_id || "")) || "",
        previous_request_status: lastRejectedStatus.get(String(row.id)) || null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return NextResponse.json({
      year,
      scope,
      total_staff: staffRows.length,
      applied_count: staffRows.length - pending.length,
      yet_to_apply_count: staff.length,
      staff,
    })
  } catch (error: any) {
    console.error("[v0] yet-to-apply error:", error)
    return NextResponse.json({ error: String(error?.message || "Internal server error") }, { status: 500 })
  }
}
