import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { normalizeRole } from "@/lib/loan-workflow"
import { AUTO_LINKABLE_HOD_ROLES, selectNonRegionalHodForStaff } from "@/lib/hod-linkage-matching"
import { isHodExemptRole } from "@/lib/hr-workflow"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { findRegionalManagersForLocation } from "@/lib/regional-manager-scope"

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
      const linkedStaffProfile = profileById.get(staffId)
      if (linkedStaffProfile && isHodExemptRole(linkedStaffProfile.role)) return
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
      .filter((profile) => !isHodExemptRole(profile.role) && !HOD_CAPABLE_ROLES.has(normalizeRole(profile.role)) && !hodByStaff.has(String(profile.id)))
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

    const missingDepartmentStaff = profiles
      .filter((profile) => {
        const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments
        return !String(profile.department_id || "").trim() || !department
      })
      .map((profile) => ({
        id: profile.id,
        employee_id: profile.employee_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        role: profile.role,
        department: null,
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
      missing_department_staff: missingDepartmentStaff,
      missing_department_count: missingDepartmentStaff.length,
      hods,
      hod_count: hods.length,
      staff_count: profiles.length,
    })
  } catch (error) {
    console.error("[v0] HOD linkage management GET failed:", error)
    return json({ success: false, error: error instanceof Error ? error.message : "Could not load staff HOD linkages." }, 500)
  }
}

export async function POST() {
  try {
    const access = await getAdmin()
    if ("error" in access) return access.error
    const { admin, user } = access

    const staffProfiles: any[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("user_profiles")
        .select("id, employee_id, role, department_id, assigned_location_id, hod_id, position, is_active, region_id, departments(id, name, code), geofence_locations!user_profiles_assigned_location_id_fkey(id, name, address, location_type, parent_location_id, district_id, districts(name))")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      staffProfiles.push(...(data || []))
      if (!data || data.length < PAGE_SIZE) break
    }

    const linkedStaffIds = new Set<string>()
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("loan_hod_linkages")
        .select("staff_user_id")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      ;(data || []).forEach((row: any) => row.staff_user_id && linkedStaffIds.add(String(row.staff_user_id)))
      if (!data || data.length < PAGE_SIZE) break
    }
    staffProfiles.forEach((staff) => {
      if (staff.hod_id) linkedStaffIds.add(String(staff.id))
    })

    const candidates = staffProfiles.filter((staff) =>
      !isHodExemptRole(staff.role) &&
      !HOD_CAPABLE_ROLES.has(normalizeRole(staff.role)) &&
      !linkedStaffIds.has(String(staff.id)),
    )
    const autoLinkableRoleSet = new Set<string>(AUTO_LINKABLE_HOD_ROLES)
    const nonRegionalHodCandidates = staffProfiles.filter((candidate) => autoLinkableRoleSet.has(normalizeRole(candidate.role)))
    const rows: Record<string, unknown>[] = []
    const assigned = new Set<string>()
    const unresolvedNoLocation = new Set<string>()
    const unresolvedNoDepartmentHod = new Set<string>()
    const unresolvedNoRegionalManager = new Set<string>()
    const regionalManagerCache = new Map<string, Promise<Array<{ id: string; position?: string | null }>>>()

    const findRegionalManager = async (locationId: string, regionId: string) => {
      const cacheKey = `${locationId}:${regionId}`
      if (!regionalManagerCache.has(cacheKey)) {
        regionalManagerCache.set(cacheKey, (async () => {
          const locationManagers = await findRegionalManagersForLocation(admin, locationId, { limit: 1 })
          if (locationManagers.length > 0 || !regionId) return locationManagers

          const { data: regionManagers, error } = await admin
            .from("user_profiles")
            .select("id, role, position")
            .eq("role", "regional_manager")
            .eq("is_active", true)
            .eq("region_id", regionId)
            .order("created_at", { ascending: true })
            .limit(1)
          if (error) throw error
          return regionManagers || []
        })())
      }
      return (await regionalManagerCache.get(cacheKey))?.[0]
    }

    for (const staff of candidates) {
      const location = Array.isArray(staff.geofence_locations) ? staff.geofence_locations[0] : staff.geofence_locations
      const locationId = String(staff.assigned_location_id || "")
      if (!locationId) {
        unresolvedNoLocation.add(String(staff.id))
        continue
      }

      let hod: { id: string; position?: string | null } | null | undefined
      if (isNonRegionalLocation(location?.name)) {
        hod = selectNonRegionalHodForStaff(staff, nonRegionalHodCandidates)
        if (!hod?.id) unresolvedNoDepartmentHod.add(String(staff.id))
      } else {
        hod = await findRegionalManager(locationId, String(staff.region_id || ""))
        if (!hod?.id) unresolvedNoRegionalManager.add(String(staff.id))
      }

      if (!hod?.id || hod.id === staff.id) {
        continue
      }

      const district = Array.isArray(location?.districts) ? location.districts[0] : location?.districts
      rows.push({
        staff_user_id: staff.id,
        hod_user_id: hod.id,
        location_id: locationId,
        district_name: district?.name || null,
        location_address: location?.address || null,
        staff_rank: staff.position || null,
        hod_rank: hod.position || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      assigned.add(String(staff.id))
    }

    if (rows.length) {
      const { error } = await admin
        .from("loan_hod_linkages")
        .upsert(rows, { onConflict: "staff_user_id,hod_user_id", ignoreDuplicates: true })
      if (error) throw error
    }

    const unresolvedStaffIds = [
      ...unresolvedNoLocation,
      ...unresolvedNoDepartmentHod,
      ...unresolvedNoRegionalManager,
    ]
    const unresolvedByReason = {
      missing_location: unresolvedNoLocation.size,
      no_department_hod: unresolvedNoDepartmentHod.size,
      no_regional_manager: unresolvedNoRegionalManager.size,
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "ADMIN_AUTO_LINK_UNASSIGNED_STAFF_BY_SCOPE",
      table_name: "loan_hod_linkages",
      old_values: { unlinked_candidate_count: candidates.length },
      new_values: { linked_count: rows.length, unresolved_count: unresolvedStaffIds.length, unresolved_by_reason: unresolvedByReason },
      details: {
        linked_staff_ids: [...assigned],
        unresolved_staff_ids: unresolvedStaffIds,
        unresolved_no_location_ids: [...unresolvedNoLocation],
        unresolved_no_department_hod_ids: [...unresolvedNoDepartmentHod],
        unresolved_no_regional_manager_ids: [...unresolvedNoRegionalManager],
        nsp_intern_excluded: true,
        nonregional_method: "same-department HOD role matched by department; matching HOD at the same location preferred",
        regional_method: "covering Regional Manager from location hierarchy, then staff region fallback",
      },
    })
    if (auditError) console.error("[v0] Auto-link succeeded, but audit logging failed:", auditError)

    return json({
      success: true,
      linked_count: rows.length,
      unresolved_count: unresolvedStaffIds.length,
      unresolved_by_reason: unresolvedByReason,
      excluded_roles: ["nsp", "intern"],
    })
  } catch (error) {
    console.error("[v0] Admin HOD auto-link failed:", error)
    return json({ success: false, error: error instanceof Error ? error.message : "Unable to auto-link eligible staff." }, 500)
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
