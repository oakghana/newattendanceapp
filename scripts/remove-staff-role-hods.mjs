import { createClient } from "@supabase/supabase-js"

/**
 * Script to remove HOD linkages where the HOD has "staff" role
 * Staff role users should NOT be linked as HODs
 * Usage: npm run remove:staff-hods
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function removeStaffRoleHods() {
  console.log("[v0] Starting removal of staff role HOD linkages...\n")

  try {
    // Get all HOD linkages
    const { data: allLinkages, error: fetchError } = await supabase
      .from("loan_hod_linkages")
      .select("id, staff_user_id, hod_user_id, created_at")
      .limit(10000)

    if (fetchError) throw fetchError

    if (!allLinkages || allLinkages.length === 0) {
      console.log("[v0] ✅ No linkages found")
      return
    }

    console.log(`[v0] Found ${allLinkages.length} total linkages\n`)

    // Get all user IDs from linkages
    const allUserIds = [...new Set(allLinkages.flatMap((l) => [l.staff_user_id, l.hod_user_id]))]

    // Fetch user profiles with locations
    const { data: userProfiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, email, first_name, last_name, assigned_location_id")
      .in("id", allUserIds)

    if (profileError) throw profileError

    // Get location details
    const locationIds = [...new Set(
      (userProfiles || []).filter(p => p.assigned_location_id).map(p => p.assigned_location_id)
    )]

    const { data: locations, error: locError } = await supabase
      .from("locations")
      .select("id, location_name")
      .in("id", locationIds)

    if (locError) throw locError

    // Create location map
    const locationMap = new Map((locations || []).map((l) => [l.id, l.location_name]))

    // Create role map with location info
    const roleMap = new Map((userProfiles || []).map((p) => [
      p.id,
      {
        role: p.role,
        email: p.email,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        location: locationMap.get(p.assigned_location_id) || "No location assigned",
        ...p
      }
    ]))

    // Find linkages where HOD has "staff" role
    const linkagesToRemove = allLinkages.filter((linkage) => {
      const hodRole = roleMap.get(linkage.hod_user_id)?.role
      return hodRole === "staff"
    })

    console.log(`[v0] Found ${linkagesToRemove.length} linkages with staff role HODs\n`)

    if (linkagesToRemove.length === 0) {
      console.log("[v0] ✅ No staff role HODs found! All linkages are valid.")
      return
    }

    // Group by HOD for reporting
    const byHod = new Map()
    linkagesToRemove.forEach((linkage) => {
      const hodData = roleMap.get(linkage.hod_user_id)
      const key = hodData.email
      if (!byHod.has(key)) {
        byHod.set(key, [])
      }
      byHod.get(key).push(linkage)
    })

    // Show detailed breakdown by HOD
    console.log("[v0] Detailed breakdown of staff role HOD linkages:\n")
    let staffCount = 0
    for (const [hodEmail, linkages] of byHod) {
      const hodData = roleMap.get([...allUserIds].find(id => roleMap.get(id)?.email === hodEmail))
      console.log(`  HOD: ${hodData?.name || hodEmail} (staff role) - ${linkages.length} staff linked:`)
      
      // Group by location
      const byLocation = new Map()
      linkages.forEach((linkage) => {
        const staffData = roleMap.get(linkage.staff_user_id)
        const location = staffData?.location || "No location"
        if (!byLocation.has(location)) {
          byLocation.set(location, [])
        }
        byLocation.get(location).push(staffData)
      })

      // Show staff by location
      for (const [location, staffList] of byLocation) {
        console.log(`    📍 ${location} (${staffList.length} staff):`)
        staffList.slice(0, 3).forEach((staff) => {
          console.log(`      - ${staff.name} (${staff.email})`)
          staffCount++
        })
        if (staffList.length > 3) {
          console.log(`      ... and ${staffList.length - 3} more`)
        }
      }
      console.log()
    }

    // Remove linkages
    console.log("[v0] Removing invalid linkages...")
    const idsToRemove = linkagesToRemove.map((l) => l.id)
    const { error: deleteError } = await supabase
      .from("loan_hod_linkages")
      .delete()
      .in("id", idsToRemove)

    if (deleteError) throw deleteError

    console.log(`[v0] ✅ Removed ${idsToRemove.length} linkages\n`)

    // Verify
    const { data: verifyLinkages } = await supabase
      .from("loan_hod_linkages")
      .select("id")
      .limit(10000)

    // Verify no staff role HODs remain
    const { data: staffHodCount } = await supabase
      .from("loan_hod_linkages")
      .select("id")
      .limit(10000)

    const staffHodIds = staffHodCount?.filter((l) => {
      const hodRole = roleMap.get(l.hod_user_id)?.role
      return hodRole === "staff"
    }).length || 0

    // Get unique staff and HODs affected
    const affectedStaffIds = new Set(linkagesToRemove.map(l => l.staff_user_id))
    const affectedHodIds = new Set(linkagesToRemove.map(l => l.hod_user_id))
    
    // Get locations affected
    const locationsAffected = new Set()
    affectedStaffIds.forEach(staffId => {
      const staffData = roleMap.get(staffId)
      if (staffData?.location) {
        locationsAffected.add(staffData.location)
      }
    })

    // Report
    console.log("\n════════════════════════════════════════════════════════════")
    console.log("📊 STAFF ROLE HOD REMOVAL REPORT")
    console.log("════════════════════════════════════════════════════════════")
    console.log(`\n📈 OVERALL STATISTICS:`)
    console.log(`   Total linkages before: ${allLinkages.length}`)
    console.log(`   Staff role HOD linkages to remove: ${linkagesToRemove.length}`)
    console.log(`   Valid linkages remaining: ${verifyLinkages?.length || 0}`)
    console.log(`   Removed percentage: ${((linkagesToRemove.length / allLinkages.length) * 100).toFixed(2)}%`)
    console.log(`\n👥 AFFECTED ENTITIES:`)
    console.log(`   Unique staff members: ${affectedStaffIds.size}`)
    console.log(`   Staff role HODs: ${affectedHodIds.size}`)
    console.log(`   Locations affected: ${locationsAffected.size}`)
    console.log(`   Locations: ${Array.from(locationsAffected).join(", ")}`)
    console.log("\n════════════════════════════════════════════════════════════\n")

    if (staffHodIds === 0) {
      console.log("[v0] ✅ Cleanup completed! No staff role HODs remain.")
      console.log("[v0] Next: Run 'npm run auto-link:hods' to re-link staff to proper HODs\n")
    } else {
      console.warn("[ERROR] Some staff role HODs still remain!")
      process.exit(1)
    }
  } catch (error) {
    console.error("[ERROR] Cleanup failed:", error)
    process.exit(1)
  }
}

removeStaffRoleHods()
