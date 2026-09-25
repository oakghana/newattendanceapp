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

    // Use adminSupabase to bypass RLS and read the user's role. Role values have
    // historically been stored with either hyphens or underscores, so normalize
    // before checking authorization (especially for regional IT Admin profiles).
    const { data: profile } = await adminSupabase.from("user_profiles").select("role, assigned_location_id").eq("id", user.id).single()
    const normalizedRequesterRole = String(profile?.role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")

    if (!profile || !["admin", "it_admin", "department_head", "regional_manager", "manager_hr", "director_hr", "hr_leave_office"].includes(normalizedRequesterRole)) {
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
      staff_category,
      is_active,
      assigned_location_id,
      email,
      date_of_appointment,
      years_of_service,
      contact_number,
    } = body
    let { role } = body

    // Map non-database roles to their database equivalents.
    // NOTE: 'accounts' and 'accounts_executive' are distinct roles (Accounts forwards
    // FD values, Accounts Executive reviews/approves them) and must NOT be collapsed.
    if (role === "hr_executive") {
      role = "hr_leave_office"
    }

    // Select the full existing row so partial updates (e.g. toggling is_active
    // alone) can fall back to the current values instead of wiping them out.
    const { data: targetProfile } = await adminSupabase.from("user_profiles").select("*").eq("id", id).single()

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const protectedAdministratorEmail = "ohemengappiah@qccgh.com"
    const isProtectedAdministrator = String(targetProfile.email || "").trim().toLowerCase() === protectedAdministratorEmail
    if (isProtectedAdministrator && (role !== undefined && role !== "admin" || is_active === false || (email && String(email).trim().toLowerCase() !== protectedAdministratorEmail))) {
      await adminSupabase.from("audit_logs").insert({ user_id: user.id, action: "blocked_protected_administrator_change", resource_type: "user_profile", resource_id: id, details: { target_email: protectedAdministratorEmail, attempted_role: role, attempted_active: is_active, attempted_email: email } })
      return NextResponse.json({ error: "The sole Administrator account is protected and cannot be reassigned, deactivated, renamed, or deleted through this route." }, { status: 403 })
    }
    if (isProtectedAdministrator) role = "admin"

    // This route accepts partial updates (e.g. { is_active } only from the
    // Activate/Deactivate button). Any field omitted from the request body
    // falls back to the staff member's existing value rather than being
    // wiped out.
    const mergedFirstName = first_name !== undefined ? first_name : targetProfile.first_name
    const mergedLastName = last_name !== undefined ? last_name : targetProfile.last_name
    const mergedEmployeeId = employee_id !== undefined ? employee_id : targetProfile.employee_id
    const mergedRole = role !== undefined ? role : targetProfile.role
    const mergedIsActive = is_active !== undefined ? is_active : targetProfile.is_active
    const mergedDepartmentId = department_id !== undefined ? department_id : targetProfile.department_id
    const mergedPosition = position !== undefined ? position : targetProfile.position
    const mergedStaffCategory = staff_category !== undefined ? staff_category : targetProfile.staff_category
    const mergedDateOfAppointment = date_of_appointment !== undefined ? date_of_appointment : targetProfile.date_of_appointment
    const mergedYearsOfService = years_of_service !== undefined ? years_of_service : targetProfile.years_of_service
    const mergedContactNumber = contact_number !== undefined ? contact_number : targetProfile.contact_number
    const mergedAssignedLocationId =
      assigned_location_id !== undefined ? assigned_location_id : targetProfile.assigned_location_id

    if (!mergedFirstName || !mergedLastName || !mergedEmployeeId) {
      return NextResponse.json({ error: "First name, last name, and employee ID are required" }, { status: 400 })
    }

    const validCategories = ["Manager", "Senior", "Officer", "Junior"] as const
    if (mergedStaffCategory !== undefined && mergedStaffCategory !== null && !validCategories.includes(mergedStaffCategory)) {
      return NextResponse.json(
        { error: "Invalid staff category", details: `Category must be one of: ${validCategories.join(", ")}` },
        { status: 400 },
      )
    }

    // Staff members can only be assigned to HOD, RM, HR Executive, Department Head, or Managing Director
    if (role === "staff") {
      const validSupervisors = ["hod", "regional_manager", "accounts", "hr_office", "department_head", "director_hr"]
      // Check if this staff will be assigned to someone with an invalid role
      // For now, just allow the assignment (validation would be on the linking table)
    }

    const normalizedTargetRole = String(targetProfile.role || "").trim().toLowerCase().replace(/[-\s]+/g, "_")
    const protectedItAdminTarget = ["admin", "administrator", "it_admin", "itadmin"].includes(normalizedTargetRole)
    const { data: requesterLocation } = profile?.assigned_location_id
      ? await adminSupabase.from("geofence_locations").select("name, location_type").eq("id", profile.assigned_location_id).maybeSingle()
      : { data: null }
    const { data: targetLocation } = targetProfile.assigned_location_id
      ? await adminSupabase.from("geofence_locations").select("name, location_type").eq("id", targetProfile.assigned_location_id).maybeSingle()
      : { data: null }
    const requesterLocationText = `${requesterLocation?.name || ""} ${requesterLocation?.location_type || ""}`.toLowerCase()
    const targetLocationText = `${targetLocation?.name || ""} ${targetLocation?.location_type || ""}`.toLowerCase()
    const isRegionalItAdmin = normalizedRequesterRole === "it_admin" && Boolean(profile?.assigned_location_id) && !/(head office|swanzy|archive|awutu|cocoa clinic)/.test(requesterLocationText)
    const isRegionalStaffTarget = Boolean(targetProfile.assigned_location_id) && !/(head office|swanzy|archive|awutu|cocoa clinic)/.test(targetLocationText)
    const isSameRegionalLocation = Boolean(profile?.assigned_location_id) && profile.assigned_location_id === targetProfile.assigned_location_id
    const isSelfUpdate = user.id === id

    // Regional IT Admins are scoped to their own assigned regional office. A
    // regional admin must not edit records belonging to another location.
    if (isRegionalItAdmin && !isSelfUpdate && (!isRegionalStaffTarget || !isSameRegionalLocation)) {
      return NextResponse.json({ error: "Regional IT Admins may only update staff assigned to their own regional location." }, { status: 403 })
    }

    if (isRegionalItAdmin) {
      const permittedFields = isSelfUpdate
        ? ["date_of_appointment", "date_of_assumption"]
        : ["date_of_appointment", "date_of_assumption", "staff_category", "role"]
      const fieldMap: Record<string, string> = {
        first_name: "first_name", last_name: "last_name", employee_id: "employee_id", department_id: "department_id",
        position: "position", role: "role", is_active: "is_active", assigned_location_id: "assigned_location_id",
        email: "email", staff_category: "staff_category", date_of_appointment: "date_of_appointment",
        date_of_assumption: "date_of_assumption", years_of_service: "years_of_service", contact_number: "contact_number",
      }
      const changedFields = Object.keys(fieldMap).filter((field) => {
        if (!Object.prototype.hasOwnProperty.call(body, field)) return false
        const incoming = body[field]
        const existing = targetProfile[field]
        return String(incoming ?? "") !== String(existing ?? "")
      })
      if (changedFields.some((field) => !permittedFields.includes(field))) {
        return NextResponse.json({ error: isSelfUpdate ? "Regional IT Admins may edit only their own appointment and assumption dates." : "Regional IT Admins may edit appointment, assumption, category, and role data for regional staff." }, { status: 403 })
      }
    }

    if (normalizedRequesterRole === "it_admin" && protectedItAdminTarget) {
      console.error("[v0] Staff API PUT - IT-Admin tried to modify protected account")
      return NextResponse.json(
        {
          error: "IT-Admin users cannot modify Administrator or IT-Admin accounts",
        },
        { status: 403 },
      )
    }

    const normalizedActorRole = String(profile.role || "").trim().toLowerCase().replace(/[-\s]+/g, "_")
    const isAdministrator = ["admin", "administrator"].includes(normalizedActorRole)
    const isItAdmin = ["it_admin", "itadmin"].includes(normalizedActorRole)
    const regionalHrRoles = ["hr_leave_office", "hr_records", "hr_records_office", "regional_hr", "regional_hr_leave_office", "regional_hr_office", "regional_hr_officer"]

    if (role && regionalHrRoles.includes(String(role).trim().toLowerCase()) && !isAdministrator) {
      console.error("[v0] Staff API PUT - Non-administrator tried to assign Regional HR Leave Office role")
      return NextResponse.json({ error: "Only administrators can assign the Regional HR Leave Office role" }, { status: 403 })
    }

    const allowedRolesForItAdmin = ["staff", "nsp", "contract", "department_head", "driver", "chief_driver", "it-admin", "intern"]
    if (isItAdmin && role && !allowedRolesForItAdmin.includes(role)) {
      console.error("[v0] Staff API PUT - IT-Admin tried to assign restricted role:", role)
      return NextResponse.json(
        {
          error: "IT-Admin users cannot assign this role",
          details: `IT-Admin may only assign the following roles: ${allowedRolesForItAdmin.join(", ")}`,
        },
        { status: 403 },
      )
    }

    if (isItAdmin && role === "department_head" && mergedAssignedLocationId && mergedAssignedLocationId !== "none") {
      const { data: assignedLocation } = await adminSupabase
        .from("geofence_locations")
        .select("name, location_type, parent_location_id, district_id")
        .eq("id", mergedAssignedLocationId)
        .maybeSingle()
      const locationName = String(assignedLocation?.name || "").toLowerCase()
      const locationType = String(assignedLocation?.location_type || "").toLowerCase()
      const isRegionalOrDistrict = locationType === "regional" || locationType === "district" || /regional|district/.test(locationName)
      if (isRegionalOrDistrict) {
        return NextResponse.json({ error: "IT-Admin cannot assign Department Head to staff in a regional office or district location." }, { status: 403 })
      }
    }

    if (role && (role === "admin" || role === "regional_manager") && !isAdministrator) {
      console.error("[v0] Staff API PUT - Non-admin tried to assign admin or regional_manager role")
      return NextResponse.json(
        {
          error: "Only administrators can assign Admin or Regional Manager roles",
        },
        { status: 403 },
      )
    }

    let locationId = null
    if (mergedAssignedLocationId && mergedAssignedLocationId !== "none") {
      // Verify location exists
      const { data: locationExists } = await adminSupabase
        .from("geofence_locations")
        .select("id")
        .eq("id", mergedAssignedLocationId)
        .single()

      if (locationExists) {
        locationId = mergedAssignedLocationId
      } else {
        console.log("[v0] Invalid location ID provided:", mergedAssignedLocationId)
        return NextResponse.json({ error: "Invalid location selected" }, { status: 400 })
      }
    }

    console.log("[v0] Processed location ID:", locationId)

    const updateData: Record<string, any> = {
      first_name: mergedFirstName,
      last_name: mergedLastName,
      employee_id: mergedEmployeeId,
      department_id: mergedDepartmentId || null,
      position: mergedPosition || null,
      staff_category: mergedStaffCategory || null,
      role: mergedRole,
      is_active: mergedIsActive,
      assigned_location_id: locationId,
      date_of_appointment: mergedDateOfAppointment || null,
      years_of_service: mergedYearsOfService !== undefined && mergedYearsOfService !== "" && mergedYearsOfService !== null ? parseInt(String(mergedYearsOfService), 10) : null,
      contact_number: mergedContactNumber || null,
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
          error: `Failed to update staff member: ${(safeDetails as any).message || String(safeDetails)}`,
          details: safeDetails,
        },
        { status: 500 },
      )
    }

    if (mergedIsActive === false && targetProfile.is_active !== false && ["department_head", "regional_manager"].includes(normalizedTargetRole)) {
      const cleanupAt = new Date().toISOString()
      const { error: linkageCleanupError } = await adminSupabase
        .from("loan_hod_linkages")
        .delete()
        .eq("hod_user_id", id)
      if (linkageCleanupError) console.error("[v0] HOD linkage cleanup failed:", linkageCleanupError)
      await adminSupabase.from("user_profiles").update({ hod_id: null, updated_at: cleanupAt }).eq("hod_id", id)
      await adminSupabase.from("nonregional_transport_requisitions").update({ hod_id: null, updated_at: cleanupAt }).eq("hod_id", id)
    }

    if (staff_category !== undefined && updatedProfile?.staff_category !== staff_category) {
      console.error("[v0] Staff category did not persist:", {
        requested: staff_category,
        persisted: updatedProfile?.staff_category,
        staffId: id,
      })
      return NextResponse.json(
        { error: "Staff category was not persisted", details: { requested: staff_category, persisted: updatedProfile?.staff_category } },
        { status: 409 },
      )
    }

    console.log("[v0] Staff updated successfully:", updatedProfile)

    // When assigned location changes (or is set), auto-link district/regional staff
    // to the Regional Manager covering their parent regional office.
    try {
      const previousLocationId = String(targetProfile.assigned_location_id || "")
      const nextLocationId = String(locationId || "")
      const locationChanged = previousLocationId !== nextLocationId
      if (locationChanged && nextLocationId) {
        const { isNonRegionalLocation } = await import("@/lib/location-mappings")
        const locationName = String((updatedProfile as any)?.geofence_locations?.name || "")
        if (!isNonRegionalLocation(locationName)) {
          const { findRegionalManagersForLocation } = await import("@/lib/regional-manager-scope")
          const managers = await findRegionalManagersForLocation(adminSupabase, nextLocationId, { limit: 1 })
          if (managers[0]?.id && managers[0].id !== id) {
            await adminSupabase.from("loan_hod_linkages").upsert(
              {
                staff_user_id: id,
                hod_user_id: managers[0].id,
                location_id: nextLocationId,
                created_by: user.id,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "staff_user_id", ignoreDuplicates: false },
            )
            console.log("[v0] Staff API PUT - Auto-linked regional staff to Regional Manager:", managers[0].id)
          }
        }
      }
    } catch (autoLinkErr) {
      console.error("[v0] Staff API PUT - Regional HOD auto-link failed (non-fatal):", autoLinkErr)
    }

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

    const { data: targetProfile } = await supabase.from("user_profiles").select("email, role").eq("id", id).single()
    if (String(targetProfile?.email || "").trim().toLowerCase() === "ohemengappiah@qccgh.com") {
      return NextResponse.json({ error: "The sole Administrator account cannot be deactivated." }, { status: 403 })
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
