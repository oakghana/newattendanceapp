import { createClient } from "@supabase/supabase-js"

/**
 * Script to remove inactive HOD linkages from the database
 * 
 * Usage:
 *   npm run cleanup:hods
 * 
 * This script:
 * 1. Connects to Supabase
 * 2. Finds all loan_hod_linkages where either staff or HOD is inactive
 * 3. Removes those linkages
 * 4. Reports statistics
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  console.error("Make sure .env.development.local has these variables set")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function cleanupInactiveHods() {
  console.log("[v0] Starting inactive HOD linkage cleanup...")
  console.log("[v0] Connecting to Supabase...\n")

  try {
    // Step 1: Get all HOD linkages
    console.log("[v0] Step 1: Fetching all HOD linkages...")
    const { data: allLinkages, error: fetchError } = await supabase
      .from("loan_hod_linkages")
      .select("id, staff_user_id, hod_user_id, created_at")
      .limit(10000)

    if (fetchError) throw fetchError

    if (!allLinkages || allLinkages.length === 0) {
      console.log("[v0] ✅ No linkages found in database")
      return
    }

    console.log(`[v0] ✅ Found ${allLinkages.length} total linkages\n`)

    // Step 2: Get all user IDs from linkages
    console.log("[v0] Step 2: Extracting user IDs...")
    const allUserIds = [...new Set(allLinkages.flatMap((l) => [l.staff_user_id, l.hod_user_id]))]
    console.log(`[v0] ✅ Found ${allUserIds.length} unique users\n`)

    // Step 3: Fetch user profiles to check is_active status
    console.log("[v0] Step 3: Fetching user profiles to check active status...")
    const { data: userProfiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, is_active, email, first_name, last_name, role")
      .in("id", allUserIds)

    if (profileError) throw profileError

    // Create a map of active status
    const activeMap = new Map(
      (userProfiles || []).map((p) => [p.id, { active: p.is_active === true, ...p }])
    )

    console.log(`[v0] ✅ Fetched ${userProfiles?.length || 0} user profiles\n`)

    // Step 4: Find linkages where either party is inactive
    console.log("[v0] Step 4: Analyzing linkages...")
    const linkagesToRemove = allLinkages.filter((linkage) => {
      const staffActive = activeMap.get(linkage.staff_user_id)?.active ?? false
      const hodActive = activeMap.get(linkage.hod_user_id)?.active ?? false
      return !staffActive || !hodActive
    })

    console.log(`[v0] Found ${linkagesToRemove.length} invalid linkages to remove\n`)

    if (linkagesToRemove.length === 0) {
      console.log("[v0] ✅ All linkages are valid (both parties are active)")
      console.log("\n📊 Statistics:")
      console.log(`  Total linkages: ${allLinkages.length}`)
      console.log(`  Valid linkages: ${allLinkages.length}`)
      console.log(`  Removed: 0`)
      return
    }

    // Step 5: Display details of linkages to be removed
    console.log("[v0] Step 5: Details of linkages to remove:\n")
    linkagesToRemove.forEach((linkage, index) => {
      const staffData = activeMap.get(linkage.staff_user_id)
      const hodData = activeMap.get(linkage.hod_user_id)
      const staffStatus = staffData?.active ? "ACTIVE" : "INACTIVE"
      const hodStatus = hodData?.active ? "ACTIVE" : "INACTIVE"
      console.log(`  ${index + 1}. Staff: ${staffData?.email} (${staffStatus}) → HOD: ${hodData?.email} (${hodStatus})`)
    })
    console.log()

    // Step 6: Remove invalid linkages
    console.log("[v0] Step 6: Removing invalid linkages...")
    const idsToRemove = linkagesToRemove.map((l) => l.id)
    const { error: deleteError, count } = await supabase
      .from("loan_hod_linkages")
      .delete()
      .in("id", idsToRemove)

    if (deleteError) throw deleteError

    console.log(`[v0] ✅ Removed ${idsToRemove.length} invalid linkages\n`)

    // Step 7: Verify removal
    console.log("[v0] Step 7: Verifying removal...")
    const { data: verifyLinkages, error: verifyError } = await supabase
      .from("loan_hod_linkages")
      .select("id, staff_user_id, hod_user_id")
      .limit(10000)

    if (verifyError) throw verifyError

    console.log(`[v0] ✅ Verification complete\n`)

    // Final Report
    console.log("=" * 60)
    console.log("📊 CLEANUP REPORT")
    console.log("=" * 60)
    console.log(`Total linkages before cleanup: ${allLinkages.length}`)
    console.log(`Invalid linkages removed: ${linkagesToRemove.length}`)
    console.log(`Valid linkages remaining: ${verifyLinkages?.length || 0}`)
    console.log(`Removed percentage: ${((linkagesToRemove.length / allLinkages.length) * 100).toFixed(2)}%`)
    console.log("=" * 60)
    console.log()

    console.log("[v0] ✅ Cleanup completed successfully!")
  } catch (error) {
    console.error("[ERROR] Cleanup failed:", error)
    process.exit(1)
  }
}

// Run the cleanup
cleanupInactiveHods()
