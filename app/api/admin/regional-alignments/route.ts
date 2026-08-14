import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

const ADMIN_ROLES = new Set(["admin", "administrator", "it-admin", "it_admin", "itadmin"])
const HR_ROLES = ["hr", "hr_office", "regional_hr", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office", "regional_hr_officer"]

async function getContext() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: actor } = await client.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!actor || !ADMIN_ROLES.has(String(actor.role).toLowerCase())) {
    return { error: NextResponse.json({ error: "Only administrators and IT administrators can manage regional alignments." }, { status: 403 }) }
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  return { admin, actorId: user.id }
}

export async function GET() {
  try {
    const context = await getContext()
    if (context.error) return context.error
    const { admin } = context
    const [{ data: locations, error: locationError }, { data: assignments, error: assignmentError }, { data: users, error: usersError }] = await Promise.all([
      admin.from("geofence_locations").select("id, name, address, district_id").eq("is_active", true).order("name"),
      admin.from("regional_hr_office_locations").select("id, regional_hr_user_id, location_id, region_id, is_active, assigned_at").eq("is_active", true),
      admin.from("user_profiles").select("id, first_name, last_name, role, assigned_location_id, region_id, is_active").eq("is_active", true).in("role", [...HR_ROLES, "regional_manager"]).order("first_name"),
    ])
    if (locationError || assignmentError || usersError) throw locationError || assignmentError || usersError
    const { data: managers } = await admin.from("regional_manager_locations").select("location_id, user_id, regional_manager_id, manager_id")
    return NextResponse.json({ success: true, locations: locations || [], assignments: assignments || [], managers: managers || [], eligibleUsers: users || [] })
  } catch (error) {
    console.error("[v0] regional alignment GET", error)
    return NextResponse.json({ error: "Failed to load regional alignments" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getContext()
    if (context.error) return context.error
    const { admin, actorId } = context
    const body = await request.json()
    const locationId = String(body.locationId || "")
    const regionalHrUserId = body.regionalHrUserId ? String(body.regionalHrUserId) : null
    if (!locationId) return NextResponse.json({ error: "Location is required" }, { status: 400 })
    const { data: location } = await admin.from("geofence_locations").select("id, district_id").eq("id", locationId).maybeSingle()
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })
    if (regionalHrUserId) {
      const { data: hr } = await admin.from("user_profiles").select("id, role, is_active").eq("id", regionalHrUserId).maybeSingle()
      if (!hr || !hr.is_active || !HR_ROLES.includes(String(hr.role).toLowerCase())) return NextResponse.json({ error: "Selected user is not an active Regional HR officer" }, { status: 400 })
    }
    await admin.from("regional_hr_office_locations").update({ is_active: false, updated_at: new Date().toISOString() }).eq("location_id", locationId).eq("is_active", true)
    if (regionalHrUserId) {
      const { error } = await admin.from("regional_hr_office_locations").insert({ regional_hr_user_id: regionalHrUserId, location_id: locationId, assigned_by: actorId, is_active: true })
      if (error) throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] regional alignment PUT", error)
    return NextResponse.json({ error: "Failed to save regional alignment" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const context = await getContext()
  if (context.error) return context.error
  const { admin } = context
  const { locationId } = await request.json()
  const { error } = await admin.from("regional_hr_office_locations").update({ is_active: false, updated_at: new Date().toISOString() }).eq("location_id", locationId).eq("is_active", true)
  if (error) return NextResponse.json({ error: "Failed to clear alignment" }, { status: 500 })
  return NextResponse.json({ success: true })
}
