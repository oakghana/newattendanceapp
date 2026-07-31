import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

const ALLOWED_HOD_ROLES = ["hr_executive", "accounts_executive", "regional_manager", "departmental_head"]

export async function POST(request: NextRequest) {
  try {
    // Only admins can perform auto-linking
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
      return NextResponse.json({ success: false, error: "Only admins can auto-link HODs" }, { status: 403 })
    }

    // Get all staff members with their departments and locations
    // Note: Using a large limit to ensure we fetch all 2000+ staff members
    // Default Supabase limit is 1000, so we set it higher
    const { data: staffMembers, error: staffError } = await supabase
      .from("user_profiles")
      .select("id, department_id, assigned_location_id, role")
      .eq("is_active", true)
      .not("role", "in", `(${ALLOWED_HOD_ROLES.join(",")})`)
      .limit(10000) // Increased from default 1000 to accommodate 2000+ staff

    if (staffError) throw staffError

    if (!staffMembers || staffMembers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No staff members to link",
        stats: { total: 0, linked: 0, skipped: 0 },
      })
    }

    let linked = 0
    let skipped = 0
    const linkResults: any[] = []

    // For each staff member, find HODs in their department and location
    for (const staff of staffMembers) {
      if (!staff.department_id || !staff.assigned_location_id) {
        skipped++
        continue
      }

      // Find HODs in the same department and location with allowed roles
      const { data: hods, error: hodError } = await supabase
        .from("user_profiles")
        .select("id, role, first_name, last_name")
        .eq("department_id", staff.department_id)
        .eq("assigned_location_id", staff.assigned_location_id)
        .in("role", ALLOWED_HOD_ROLES)
        .eq("is_active", true)

      if (hodError) {
        console.error(`[v0] Error finding HODs for staff ${staff.id}:`, hodError)
        skipped++
        continue
      }

      if (!hods || hods.length === 0) {
        skipped++
        continue
      }

      // Link staff to each HOD found
      for (const hod of hods) {
        // Check if linkage already exists
        const { data: existing } = await supabase
          .from("loan_hod_linkages")
          .select("id")
          .eq("staff_user_id", staff.id)
          .eq("hod_user_id", hod.id)
          .single()

        if (!existing) {
          // Create new linkage
          const { error: linkError } = await supabase.from("loan_hod_linkages").insert({
            staff_user_id: staff.id,
            hod_user_id: hod.id,
            location_id: staff.assigned_location_id,
            created_by: user.id,
          })

          if (linkError) {
            console.error(`[v0] Error creating linkage for staff ${staff.id} to HOD ${hod.id}:`, linkError)
          } else {
            linked++
            linkResults.push({
              staffId: staff.id,
              hodId: hod.id,
              hodName: `${hod.first_name} ${hod.last_name}`,
              hodRole: hod.role,
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-linked ${linked} staff to HODs`,
      stats: {
        total: staffMembers.length,
        linked,
        skipped,
      },
      links: linkResults,
    })
  } catch (error: any) {
    console.error("[v0] Auto-link HODs error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to auto-link HODs",
      },
      { status: 500 },
    )
  }
}
