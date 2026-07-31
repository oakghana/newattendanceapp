import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * DELETE /api/admin/cleanup-inactive-hod-linkages
 *
 * Removes loan_hod_linkages where either:
 * 1. The staff member (staff_user_id) is marked as is_active=false, OR
 * 2. The HOD (hod_user_id) is marked as is_active=false
 *
 * Prevents inactive members from being linked to active HODs or vice versa.
 * Run this periodically or after deactivating staff/HODs.
 */

export async function DELETE(request: NextRequest) {
  try {
    const supabaseModule = await import("@/lib/supabase/server")
    const createClient = supabaseModule.createClient
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Only admins can cleanup HOD linkages" }, { status: 403 })
    }

    // Get all HOD linkages
    const { data: allLinkages, error: fetchError } = await supabase
      .from("loan_hod_linkages")
      .select("id, staff_user_id, hod_user_id")
      .limit(10000)

    if (fetchError) throw fetchError

    if (!allLinkages || allLinkages.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No linkages found",
        stats: { total: 0, removed: 0, checked: 0 },
      })
    }

    // Get all staff and HOD user IDs
    const allUserIds = [
      ...new Set(allLinkages.flatMap((l) => [l.staff_user_id, l.hod_user_id])),
    ]

    // Fetch user profiles to check is_active status
    const { data: userProfiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, is_active")
      .in("id", allUserIds)

    if (profileError) throw profileError

    // Create a map of active status
    const activeMap = new Map(
      (userProfiles || []).map((p: any) => [p.id, p.is_active === true])
    )

    // Find linkages where either party is inactive
    const linkagesToRemove = allLinkages.filter((linkage) => {
      const staffActive = activeMap.get(linkage.staff_user_id) ?? false
      const hodActive = activeMap.get(linkage.hod_user_id) ?? false
      return !staffActive || !hodActive
    })

    if (linkagesToRemove.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All linkages are valid (both parties active)",
        stats: { total: allLinkages.length, removed: 0, checked: allLinkages.length },
      })
    }

    // Remove invalid linkages
    const idsToRemove = linkagesToRemove.map((l) => l.id)
    const { error: deleteError, count } = await supabase
      .from("loan_hod_linkages")
      .delete()
      .in("id", idsToRemove)

    if (deleteError) throw deleteError

    return NextResponse.json({
      success: true,
      message: `Removed ${linkagesToRemove.length} invalid HOD linkages (where staff or HOD is inactive)`,
      stats: {
        total: allLinkages.length,
        removed: linkagesToRemove.length,
        checked: allLinkages.length,
      },
      removedLinkages: linkagesToRemove.map((l) => ({
        staffId: l.staff_user_id,
        hodId: l.hod_user_id,
        reason: `${!activeMap.get(l.staff_user_id) ? "Staff inactive" : ""} ${!activeMap.get(l.hod_user_id) ? "HOD inactive" : ""}`.trim(),
      })),
    })
  } catch (error: any) {
    console.error("[v0] Cleanup inactive HOD linkages error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to cleanup HOD linkages",
      },
      { status: 500 },
    )
  }
}
