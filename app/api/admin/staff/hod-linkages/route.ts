import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { normalizeRole } from "@/lib/loan-workflow"

const PAGE_SIZE = 500
const HOD_CAPABLE_ROLES = new Set([
  "admin", "administrator", "super_admin", "it_admin", "department_head", "hod", "manager_hr", "hr_office", "director_hr",
  "regional_manager", "managing_director", "transport_manager", "accounts_executive",
  "hr_executive", "hr_executive_officer", "hr_records", "hr_records_officer",
  "hr_records_manager", "hr_leave_office", "regional_hr", "secretary",
])

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private, max-age=0" },
  })
}

async function getAdmin() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return { error: json({ success: false, error: "Authentication required" }, 401) }

  const admin = await createAdminClient()
  const { data: profile, error } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (error) throw error
  if (!profile || !["admin", "administrator"].includes(normalizeRole(profile.role))) {
    return { error: json({ success: false, error: "Only Admin can manage all staff HOD linkages." }, 403) }
  }
  return { admin, user }
}

export async function GET() {
  try {
    const access = await getAdmin()
    if ("error" in access) return access.error
    const { admin } = access

    const profiles: any[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("user_profiles")
        .select("id, employee_id, first_name, last_name, email, role, department_id, assigned_location_id, hod_id, is_active, departments(id, name, code), geofence_locations!user_profiles_assigned_location_id_fkey(id, name, address)")
        .eq("is_active", true)
        .order("last_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      profiles.push(...(data || []))
      if (!data || data.length < PAGE_SIZE) break
    }

    const linkageRows: Array<{ staff_user_id: string; hod_user_id: string }> = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("loan_hod_linkages")
        .select("staff_user_id, hod_user_id")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      linkageRows.push(...((data || []) as Array<{ staff_user_id: string; hod_user_id: string }>))
      if (!data || data.length < PAGE_SIZE) break
    }

    const profileById = new Map<string, any>(profiles.map((profile) => [String(profile.id), profile]))
    const staffByHod = new Map<string, Set<string>>()
    const hodByStaff = new Map<string, Set<string>>()
    const addLink = (staffId: string, hodId: string) => {
      if (!staffId || !hodId || staffId === hodId) return
      if (!staffByHod.has(hodId)) staffByHod.set(hodId, new Set())
      if (!hodByStaff.has(staffId)) hodByStaff.set(staffId, new Set())
      staffByHod.get(hodId)!.add(staffId)
      hodByStaff.get(staffId)!.add(hodId)
    }

    linkageRows.forEach((link) => addLink(String(link.staff_user_id || ""), String(link.hod_user_id || "")))
    profiles.forEach((profile) => {
      if (profile.hod_id) addLink(String(profile.id), String(profile.hod_id))
    })

    const hodIds = [...staffByHod.keys()]
    const missingHodProfiles = hodIds.filter((id) => !profileById.has(id))
    for (let index = 0; index < missingHodProfiles.length; index += 200) {
      const chunk = missingHodProfiles.slice(index, index + 200)
      const { data, error } = await admin
        .from("user_profiles")
        .select("id, employee_id, first_name, last_name, email, role, is_active, department_id, assigned_location_id, departments(id, name, code), geofence_locations!user_profiles_assigned_location_id_fkey(id, name, address)")
        .in("id", chunk)
      if (error) throw error
      ;(data || []).forEach((profile: any) => profileById.set(String(profile.id), profile))
    }

    const unlinkedStaff = profiles
      .filter((profile) => !HOD_CAPABLE_ROLES.has(normalizeRole(profile.role)) && !hodByStaff.has(String(profile.id)))
      .map((profile) => ({
        id: profile.id,
        employee_id: profile.employee_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        role: profile.role,
        department: Array.isArray(profile.departments) ? profile.departments[0] || null : profile.departments || null,
        location: Array.isArray(profile.geofence_locations) ? profile.geofence_locations[0] || null : profile.geofence_locations || null,
      }))

    const hods = [...staffByHod.entries()]
      .map(([hodId, linkedStaffIds]) => {
        const profile = profileById.get(hodId)
        if (!profile) return null
        const staffPreview = [...linkedStaffIds]
          .map((id) => profileById.get(id))
          .filter(Boolean)
          .map((staff) => ({
            id: staff.id,
            employee_id: staff.employee_id,
            name: `${staff.first_name || ""} ${staff.last_name || ""}`.trim() || "Unnamed staff",
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        return {
          id: hodId,
          employee_id: profile.employee_id,
          name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unnamed HOD",
          email: profile.email,
          role: profile.role,
          department: Array.isArray(profile.departments) ? profile.departments[0]?.name : profile.departments?.name,
          location: Array.isArray(profile.geofence_locations) ? profile.geofence_locations[0]?.name : profile.geofence_locations?.name,
          is_active: profile.is_active,
          linked_staff_count: linkedStaffIds.size,
          staff_preview: staffPreview.slice(0, 6),
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.linked_staff_count - a.linked_staff_count || a.name.localeCompare(b.name))

    return json({
      success: true,
      unlinked_staff: unlinkedStaff,
      unlinked_count: unlinkedStaff.length,
      hods,
      hod_count: hods.length,
      staff_count: profiles.length,
    })
  } catch (error) {
    console.error("[v0] HOD linkage management GET failed:", error)
    return json({ success: false, error: error instanceof Error ? error.message : "Could not load staff HOD linkages." }, 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getAdmin()
    if ("error" in access) return access.error
    const body = await request.json().catch(() => ({}))
    const hodUserId = String(body.hod_user_id || "").trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hodUserId)) {
      return json({ success: false, error: "Select a valid HOD before removing assignments." }, 400)
    }

    const { data, error } = await access.admin.rpc("admin_remove_hod_links", {
      p_hod_user_id: hodUserId,
      p_actor_id: access.user.id,
    })
    if (error) throw error
    return json({ success: true, data })
  } catch (error) {
    console.error("[v0] Bulk HOD unlink failed:", error)
    return json({ success: false, error: error instanceof Error ? error.message : "Could not remove staff from this HOD." }, 500)
  }
}
