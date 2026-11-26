import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { AUTO_LINKABLE_HOD_ROLES, selectNonRegionalHodForStaff } from "../lib/hod-linkage-matching"
import { normalizeRole } from "../lib/loan-workflow"
import { isHodExemptRole } from "../lib/hr-workflow"
import { isNonRegionalLocation } from "../lib/location-mappings"
import { findRegionalManagersForLocation } from "../lib/regional-manager-scope"

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const excludedRoles = new Set(["admin", "administrator", "super_admin", "it_admin", "department_head", "hod", "manager_hr", "hr_office", "director_hr", "regional_manager", "managing_director", "transport_manager", "accounts_executive", "hr_executive", "hr_executive_officer", "hr_records", "hr_records_officer", "hr_records_manager", "hr_leave_office", "regional_hr", "secretary"])

describe("read-only live auto-link dry run", () => {
  it("counts eligible matches without writing assignments", async () => {
    const profiles: any[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from("user_profiles")
        .select("id, role, department_id, assigned_location_id, region_id, position, departments(id,name,code), geofence_locations!user_profiles_assigned_location_id_fkey(id,name,location_type,parent_location_id,district_id,districts(name))")
        .eq("is_active", true).order("id").range(from, from + 499)
      if (error) throw error
      profiles.push(...(data || []))
      if (!data || data.length < 500) break
    }
    const { data: links, error: linkError } = await admin.from("loan_hod_linkages").select("staff_user_id")
    if (linkError) throw linkError
    const linkedIds = new Set((links || []).map((link: any) => String(link.staff_user_id)))
    profiles.forEach((profile) => { if (profile.hod_id) linkedIds.add(String(profile.id)) })
    const candidates = profiles.filter((staff) => !isHodExemptRole(staff.role) && !excludedRoles.has(normalizeRole(staff.role)) && !linkedIds.has(String(staff.id)))
    const autoHods = profiles.filter((profile) => (AUTO_LINKABLE_HOD_ROLES as readonly string[]).includes(normalizeRole(profile.role)))
    let matched = 0
    let noLocation = 0
    let noDepartmentHod = 0
    let noRegionalManager = 0
    for (const staff of candidates) {
      const location = Array.isArray(staff.geofence_locations) ? staff.geofence_locations[0] : staff.geofence_locations
      const locationId = String(staff.assigned_location_id || "")
      if (!locationId) { noLocation++; continue }
      if (isNonRegionalLocation(location?.name)) {
        if (selectNonRegionalHodForStaff(staff, autoHods)) matched++
        else noDepartmentHod++
      } else {
        let managers = await findRegionalManagersForLocation(admin, locationId, { limit: 1 })
        if (!managers.length && staff.region_id) {
          const result = await admin.from("user_profiles").select("id").eq("role", "regional_manager").eq("is_active", true).eq("region_id", staff.region_id).limit(1)
          if (result.error) throw result.error
          managers = result.data || []
        }
        if (managers.length) matched++
        else noRegionalManager++
      }
    }
    console.log(JSON.stringify({ eligible: candidates.length, matched, noLocation, noDepartmentHod, noRegionalManager }))
    expect(candidates.length).toBeGreaterThanOrEqual(matched)
  }, 120000)
})
