import { createClient } from "@supabase/supabase-js"

/**
 * Targeted cleanup script to remove 20 specific invalid HOD linkages
 * Usage: node --env-file=.env.development.local scripts/cleanup-20-invalid-hods.mjs
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// The 20 linkage IDs to remove
const LINKAGE_IDS_TO_REMOVE = [
  "511962ef-1ecd-4ecd-b1e3-b86118aa7eae", // Nelson.debrah - Staff inactive
  "75968750-63cb-45b2-8b46-a141df3efe2f", // samuel.oteng - HOD inactive
  "cf505aaf-0b2b-4c6a-8546-50fdabab47b4", // samuel.oteng - HOD inactive
  "39c1a455-c448-4132-9271-c3ffc8289552", // samuel.oteng - HOD inactive
  "4e457f98-50ec-4e96-9df7-e8a427592385", // samuel.oteng - HOD inactive
  "9a4707c8-4536-45e2-8f1d-bd420efa4dfc", // samuel.oteng - HOD inactive
  "3ad70252-49d5-4a6b-b4cf-3181cda05e67", // samuel.oteng - HOD inactive
  "3390ba1d-2e71-4ed6-b9f6-9b80a3cae6b4", // samuel.oteng - HOD inactive
  "538dd987-750c-4015-874b-c0d6306e798e", // samuel.oteng - HOD inactive
  "9bf54e8d-b875-4f9a-abb8-87d55c1a012e", // samuel.oteng - HOD inactive
  "89b56353-a899-4408-8986-38eecee8c35a", // samuel.oteng - HOD inactive
  "0e2c754f-e521-4ef2-bdee-c8d07bbfc223", // samuel.oteng - HOD inactive
  "f6aad379-588b-43f1-ae51-fb5046a6dc91", // samuel.oteng - HOD inactive
  "32ca7728-dddb-4c22-9704-93a30f5a470e", // samuel.oteng - HOD inactive
  "c5958cdf-cec6-43e6-bc8d-5994c0366350", // samuel.oteng - HOD inactive
  "cecd47a2-1d6e-460b-b13c-6304ba04ca7c", // samuel.oteng - HOD inactive
  "b70d6abf-67a2-43d6-b91c-566c2577bc46", // samuel.oteng - HOD inactive
  "25c38940-7ff9-429b-915d-b048e61f8117", // samuel.oteng - HOD inactive
  "a7925315-9863-49d6-bbcd-7950f050d48a", // samuel.oteng - HOD inactive
  "6127bbd0-8fe5-4815-bf70-3a53459dd159", // samuel.oteng - HOD inactive
]

async function cleanupTargeted() {
  console.log("[v0] Starting targeted cleanup of 20 invalid HOD linkages...\n")

  try {
    // Step 1: Get the linkages to remove
    console.log("[v0] Step 1: Retrieving linkages to remove...")
    const { data: linkagesToRemove, error: fetchError } = await supabase
      .from("loan_hod_linkages")
      .select("id, staff_user_id, hod_user_id, created_at")
      .in("id", LINKAGE_IDS_TO_REMOVE)

    if (fetchError) throw fetchError

    if (!linkagesToRemove || linkagesToRemove.length === 0) {
      console.log("[WARNING] No linkages found to remove")
      process.exit(0)
    }

    console.log(`[v0] Found ${linkagesToRemove.length} linkages to remove\n`)

    // Step 2: Get user details for display
    const allUserIds = [
      ...new Set(linkagesToRemove.flatMap((l) => [l.staff_user_id, l.hod_user_id])),
    ]
    const { data: userProfiles } = await supabase
      .from("user_profiles")
      .select("id, email, is_active")
      .in("id", allUserIds)

    const profileMap = new Map(userProfiles?.map((p) => [p.id, p]) || [])

    // Step 3: Display what will be removed
    console.log("[v0] Linkages to be removed:")
    console.log("════════════════════════════════════════════════════════════════")

    let staffInactiveCount = 0
    let hodInactiveCount = 0
    let bothInactiveCount = 0

    linkagesToRemove.forEach((linkage, index) => {
      const staff = profileMap.get(linkage.staff_user_id)
      const hod = profileMap.get(linkage.hod_user_id)
      const staffStatus = staff?.is_active ? "ACTIVE" : "INACTIVE"
      const hodStatus = hod?.is_active ? "ACTIVE" : "INACTIVE"

      if (!staff?.is_active && !hod?.is_active) bothInactiveCount++
      else if (!staff?.is_active) staffInactiveCount++
      else if (!hod?.is_active) hodInactiveCount++

      console.log(`${index + 1}. ${staff?.email} (${staffStatus}) → ${hod?.email} (${hodStatus})`)
    })

    console.log("════════════════════════════════════════════════════════════════\n")

    // Step 4: Display summary before deletion
    console.log("[v0] Summary before deletion:")
    console.log(`  • Both inactive: ${bothInactiveCount}`)
    console.log(`  • Staff inactive only: ${staffInactiveCount}`)
    console.log(`  • HOD inactive only: ${hodInactiveCount}`)
    console.log(`  • Total to remove: ${linkagesToRemove.length}\n`)

    // Step 5: Delete
    console.log("[v0] Removing invalid linkages...")
    const { error: deleteError } = await supabase
      .from("loan_hod_linkages")
      .delete()
      .in("id", LINKAGE_IDS_TO_REMOVE)

    if (deleteError) throw deleteError

    console.log(`[v0] ✅ Successfully removed ${linkagesToRemove.length} linkages\n`)

    // Step 6: Verify deletion
    console.log("[v0] Verifying deletion...")
    const { data: remainingInvalid } = await supabase
      .from("loan_hod_linkages")
      .select("id")
      .in("id", LINKAGE_IDS_TO_REMOVE)

    if (remainingInvalid && remainingInvalid.length > 0) {
      console.error(
        `[WARNING] ${remainingInvalid.length} linkages still exist after deletion`
      )
    } else {
      console.log("[v0] ✅ Verification passed - all linkages removed\n")
    }

    // Step 7: Final report
    console.log("════════════════════════════════════════════════════════════════")
    console.log("📊 CLEANUP REPORT")
    console.log("════════════════════════════════════════════════════════════════")
    console.log(`Linkages removed: ${linkagesToRemove.length}`)
    console.log(`  • Both inactive: ${bothInactiveCount}`)
    console.log(`  • Staff inactive: ${staffInactiveCount}`)
    console.log(`  • HOD inactive: ${hodInactiveCount}`)
    console.log(`Removed at: ${new Date().toISOString()}`)
    console.log("════════════════════════════════════════════════════════════════\n")

    console.log("[v0] ✅ Cleanup completed successfully!")
  } catch (error) {
    console.error("[ERROR] Cleanup failed:", error.message)
    process.exit(1)
  }
}

cleanupTargeted()
