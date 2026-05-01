import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: requester } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
    const allowedRoles = ["admin", "it-admin", "regional_manager", "department_head", "god"]
    const canView = user.id === id || allowedRoles.includes(requester?.role || "")

    if (!canView) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select(`
        *,
        departments:department_id(id, name, code),
        geofence_locations:assigned_location_id(id, name, address)
      `)
      .eq("id", id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    console.error("[v0] Get staff profile error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    console.log("[v0] Staff update API called for ID:", id)

    const supabase = await createClient()

    // Validate critical server configuration for performing admin updates
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[v0] Supabase server config missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
      return NextResponse.json(
        {
          error: "Server misconfiguration: Supabase admin credentials are not configured. Please set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in server environment variables.",
        },
        { status: 500 },
      )
    }

    let adminSupabase
    try {
      adminSupabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    } catch (clientErr) {
      console.error("[v0] Failed to initialize admin Supabase client:", clientErr)
      return NextResponse.json({ error: "Failed to initialize admin client" }, { status: 500 })
    }

    // Get authenticated user and check admin role
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Authentication failed:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use adminSupabase to bypass RLS and read the user's role
    const { data: profile } = await adminSupabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (!profile || !["admin", "it-admin", "department_head", "regional_manager"].includes(profile.role)) {
      console.log("[v0] Insufficient permissions for user:", profile?.role)
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    console.log("[v0] Update request body:", body)

    const {
      first_name,
      last_name,
      employee_id,
      department_id,
      position,
      role,
      is_active,
      assigned_location_id,
      email,
    } = body

    if (!first_name || !last_name || !employee_id) {
      return NextResponse.json({ error: "First name, last name, and employee ID are required" }, { status: 400 })
    }

    const { data: targetProfile } = await adminSupabase.from("user_profiles").select("role").eq("id", id).single()

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (profile.role === "it-admin" && (targetProfile.role === "admin" || targetProfile.role === "it-admin")) {
      console.error("[v0] Staff API PUT - IT-Admin tried to edit admin/it-admin user")
      return NextResponse.json(
        {
          error: "IT-Admin users cannot edit Admin or IT-Admin accounts",
        },
        { status: 403 },
      )
    }

    if (profile.role === "it-admin" && role && (role === "admin" || role === "it-admin")) {
      console.error("[v0] Staff API PUT - IT-Admin tried to promote user to admin/it-admin")
      return NextResponse.json(
        {
          error: "IT-Admin users cannot promote users to Admin or IT-Admin roles",
        },
        { status: 403 },
      )
    }

    if (role && (role === "admin" || role === "regional_manager") && profile.role !== "admin") {
      console.error("[v0] Staff API PUT - Non-admin tried to assign admin or regional_manager role")
      return NextResponse.json(
        {
          error: "Only administrators can assign Admin or Regional Manager roles",
        },
        { status: 403 },
      )
    }

    let locationId = null
    if (assigned_location_id && assigned_location_id !== "none") {
      // Verify location exists
      const { data: locationExists } = await supabase
        .from("geofence_locations")
        .select("id")
        .eq("id", assigned_location_id)
        .single()

      if (locationExists) {
        locationId = assigned_location_id
      } else {
        console.log("[v0] Invalid location ID provided:", assigned_location_id)
        return NextResponse.json({ error: "Invalid location selected" }, { status: 400 })
      }
    }

    console.log("[v0] Processed location ID:", locationId)

    const updateData = {
      first_name,
      last_name,
      employee_id,
      department_id: department_id || null,
      position: position || null,
      role,
      is_active,
      assigned_location_id: locationId,
      updated_at: new Date().toISOString(),
    }

    if (email) {
      try {
        console.log("[v0] Attempting to update email for user:", id)
        const { error: emailUpdateError } = await adminSupabase.auth.admin.updateUserById(id, {
          email: email,
        })

        if (emailUpdateError) {
          console.error("[v0] Email update error:", emailUpdateError)
          console.log("[v0] Email update failed, continuing with profile update")
        } else {
          updateData.email = email
          console.log("[v0] Email updated successfully")
        }
      } catch (emailError) {
        console.error("[v0] Email update exception:", emailError)
        console.log("[v0] Email update exception caught, continuing with profile update")
      }
    }

    // Update user profile using adminSupabase to bypass RLS
    const { data: updatedProfile, error: updateError } = await adminSupabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        departments:department_id(id, name, code),
        geofence_locations:assigned_location_id(id, name, address)
      `)
      .single()

    if (updateError) {
      console.error("[v0] Update error:", updateError)

      // Normalize for easier detection
      const updateMessage = String((updateError as any)?.message || "").toLowerCase()
      const updateDetails = String((updateError as any)?.details || "").toLowerCase()
      const updateCode = String((updateError as any)?.code || "")

      // Try to parse constraint name if present
      const constraintMatch = String((updateError as any)?.message || (updateError as any)?.details || "").match(/constraint\s+"([^\"]+)"/i)
      const constraintName = constraintMatch ? constraintMatch[1] : null

      // Detect check-constraint violations (common Postgres code 23514) or messages mentioning audit_staff
      if (
        updateMessage.includes("role_check") ||
        updateDetails.includes("role_check") ||
        updateMessage.includes("audit_staff") ||
        updateMessage.includes("violates check constraint") ||
        updateMessage.includes("valid_role") ||
        updateCode === "23514"
      ) {
        const safeSuggestedSQL = `-- Replace <constraint_name> if different. Example uses ${constraintName || 'user_profiles_role_check'}\nALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS ${constraintName || 'user_profiles_role_check'};\nALTER TABLE user_profiles ADD CONSTRAINT ${constraintName || 'user_profiles_role_check'} CHECK (role IN ('admin','it-admin','department_head','regional_manager','nsp','intern','contract','staff','audit_staff','accounts','loan_office','hr_office','hr_leave_office','director_hr','manager_hr','loan_committee','committee'));
\n-- Alternatively, run the query to inspect current check constraints:\nSELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'user_profiles'::regclass AND contype = 'c';`

        return NextResponse.json(
          {
            error:
              "Database constraint prevents the 'audit_staff' role from being saved. Please add 'audit_staff' to your user_profiles role constraint or run the migration provided in the admin docs.",
            details: {
              message: (updateError as any)?.message || null,
              code: (updateError as any)?.code || null,
              constraint: constraintName,
              suggested_sql: safeSuggestedSQL,
            },
          },
          { status: 400 },
        )
      }

      // Build a safe, serializable representation of the Supabase error
      const safeDetails = typeof updateError === "object" && updateError !== null
        ? {
            message: (updateError as any).message || null,
            details: (updateError as any).details || (updateError as any).hint || null,
            code: (updateError as any).code || null,
          }
        : String(updateError)

      console.error("[v0] Update error (safe):", safeDetails)

      return NextResponse.json(
        {
          error: `Failed to update staff member: ${safeDetails.message || String(safeDetails)}`,
          details: safeDetails,
        },
        { status: 500 },
      )
    }

    console.log("[v0] Staff updated successfully:", updatedProfile)

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "update_staff",
      table_name: "user_profiles",
      record_id: id,
      new_values: updatedProfile,
      ip_address: (request as any).ip || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({
      success: true,
      data: updatedProfile,
      message: "Staff member updated successfully",
    })
  } catch (error) {
    console.error("[v0] Update staff error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get authenticated user and check admin role
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (!profile || !["admin", "regional_manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Deactivate instead of delete to preserve data integrity
    const { data: deactivatedProfile, error: deactivateError } = await supabase
      .from("user_profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (deactivateError) {
      console.error("Deactivate error:", deactivateError)
      return NextResponse.json({ error: "Failed to deactivate staff member" }, { status: 500 })
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "deactivate_staff",
      table_name: "user_profiles",
      record_id: id,
      new_values: deactivatedProfile,
      ip_address: (request as any).ip || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({
      success: true,
      message: "Staff member deactivated successfully",
    })
  } catch (error) {
    console.error("Delete staff error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
