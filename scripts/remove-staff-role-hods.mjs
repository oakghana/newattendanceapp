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

    // Fetch user profiles
    const { data: userProfiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, email, first_name, last_name")
      .in("id", allUserIds)

    if (profileError) throw profileError

    // Create role map
    const roleMap = new Map((userProfiles || []).map((p) => [p.id, { role: p.role, ...p }]))

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

    // Show details
    console.log("[v0] Staff role HODs with invalid linkages:")
    for (const [hodEmail, linkages] of byHod) {
      console.log(`\n  ${hodEmail} (staff role) - ${linkages.length} linkages:`)
      linkages.slice(0, 5).forEach((linkage) => {
        const staffData = roleMap.get(linkage.staff_user_id)
        console.log(`    - ${staffData?.email}`)
      })
      if (linkages.length > 5) {
        console.log(`    ... and ${linkages.length - 5} more`)
      }
    }
    console.log()

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

    // Report
    console.log("════════════════════════════════════════════════")
    console.log("📊 STAFF ROLE HOD REMOVAL REPORT")
    console.log("════════════════════════════════════════════════")
    console.log(`Total linkages before: ${allLinkages.length}`)
    console.log(`Staff role HODs removed: ${linkagesToRemove.length}`)
    console.log(`Valid linkages remaining: ${verifyLinkages?.length || 0}`)
    console.log(`Staff role HODs still present: ${staffHodIds} (should be 0)`)
    console.log(`Removed percentage: ${((linkagesToRemove.length / allLinkages.length) * 100).toFixed(2)}%`)
    console.log("════════════════════════════════════════════════\n")

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
