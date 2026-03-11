import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

function createJsonResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Staff API - Starting GET request")

    const startTime = Date.now()

    let createClient
    try {
      const supabaseModule = await import("@/lib/supabase/server")
      createClient = supabaseModule.createClient
    } catch (importError) {
      console.error("[v0] Staff API - Import error:", importError)
      return createJsonResponse(
        {
          success: false,
          error: "Server configuration error",
          data: [],
        },
        500,
      )
    }

    let supabase
    try {
      supabase = await createClient()
    } catch (clientError) {
      console.error("[v0] Staff API - Client creation error:", clientError)
      return createJsonResponse(
        {
          success: false,
          error: "Database connection error",
          data: [],
        },
        500,
      )
    }

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[v0] Staff API - Auth error:", authError)
      return createJsonResponse({ success: false, error: "Authentication required", data: [] }, 401)
    }

    console.log("[v0] Staff API - User authenticated:", user.id)

    const urlParams = request.nextUrl.searchParams
    const searchTerm = urlParams.get("search")
    const departmentFilter = urlParams.get("department")
    const roleFilter = urlParams.get("role")
    const sortBy = urlParams.get("sortBy") || "created_at"
    const sortOrder = urlParams.get("sortOrder") || "desc"
    const page = parseInt(urlParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(urlParams.get("limit") || "50", 10), 200) // sane max

    console.log("[v0] Staff API - Filters:", { searchTerm, departmentFilter, roleFilter, sortBy, sortOrder, page, limit })

    // Fetch the requesting user's profile to check role and location
    const { data: requestingProfile } = await supabase
      .from("user_profiles")
      .select("role, assigned_location_id")
      .eq("id", user.id)
      .single()

    // Build a server-side query with pagination and optional filters (returns count)
    let query = supabase
      .from("user_profiles")
      .select(`
        id,
        employee_id,
        first_name,
        last_name,
        email,
        phone,
        department_id,
        position,
        role,
        hire_date,
        is_active,
        assigned_location_id,
        profile_image_url,
        created_at,
        updated_at
      `, { count: 'exact' })

    // Regional managers only see staff assigned to their own location (all departments)
    if (requestingProfile?.role === "regional_manager" && requestingProfile?.assigned_location_id) {
      query = query.eq("assigned_location_id", requestingProfile.assigned_location_id)
    }

    if (departmentFilter && departmentFilter !== "all") {
      query = query.eq("department_id", departmentFilter)
    }

    if (roleFilter && roleFilter !== "all") {
      query = query.eq("role", roleFilter)
    }

    // Server-side search (use ILIKE for case-insensitive partial match)
    if (searchTerm) {
      const pattern = `%${searchTerm.replace(/%/g, '\\%')}%`
      // Search across first_name, last_name, email, employee_id
      query = query.or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},employee_id.ilike.${pattern}`,
      )
    }

    const orderColumn = sortBy === "department" ? "department_id" : sortBy === "role" ? "role" : "created_at"
    const ascending = sortOrder === "asc"

    // Apply ordering and pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.order(orderColumn, { ascending }).range(from, to)

    // Execute paginated query with exact count
    const { data: staffPage, error: staffError, count: totalCount } = await query

    if (staffError) {
      console.error("[v0] Staff API - Query error:", staffError)
      return createJsonResponse({ success: false, error: "Failed to fetch staff", data: [], pagination: null }, 500)
    }

    const filteredStaff = staffPage || []

    const departmentIds = [...new Set(filteredStaff?.map((s) => s.department_id).filter(Boolean))]
    const locationIds = [...new Set(filteredStaff?.map((s) => s.assigned_location_id).filter(Boolean))]

    const [departmentsResult, locationsResult] = await Promise.all([
      departmentIds.length > 0
        ? supabase.from("departments").select("id, name, code").in("id", departmentIds)
        : { data: [], error: null },
      locationIds.length > 0
        ? supabase.from("geofence_locations").select("id, name, address").in("id", locationIds)
        : { data: [], error: null },
    ])

    const departmentsMap = new Map(departmentsResult.data?.map((d) => [d.id, d]) || [])
    const locationsMap = new Map(locationsResult.data?.map((l) => [l.id, l]) || [])

    let enrichedStaff =
      filteredStaff?.map((staffMember) => ({
        ...staffMember,
        departments: staffMember.department_id ? departmentsMap.get(staffMember.department_id) || null : null,
        geofence_locations: staffMember.assigned_location_id
          ? locationsMap.get(staffMember.assigned_location_id) || null
          : null,
      })) || []

    // Attach last modifier (who last changed the staff record) using audit_logs if available
    try {
      const staffIds = enrichedStaff.map((s) => s.id)
      if (staffIds.length > 0) {
        const { data: audits } = await supabase
          .from("audit_logs")
          .select("user_id, action, record_id, created_at")
          .in("record_id", staffIds)
          .in("action", ["update_staff", "deactivate_staff", "create_staff"])
          .order("created_at", { ascending: false })

        const latestByRecord = new Map<string, any>()
        ;(audits || []).forEach((a: any) => {
          if (!latestByRecord.has(a.record_id)) latestByRecord.set(a.record_id, a)
        })

        const actorIds = [...new Set((audits || []).map((a: any) => a.user_id).filter(Boolean))]
        let actors: any[] = []
        if (actorIds.length > 0) {
          const { data: actorProfiles } = await supabase.from("user_profiles").select("id, first_name, last_name, role").in("id", actorIds)
          actors = actorProfiles || []
        }

        const actorMap = new Map((actors || []).map((p: any) => [p.id, p]))

        enrichedStaff = enrichedStaff.map((s) => {
          const latest = latestByRecord.get(s.id)
          if (latest) {
            const actor = actorMap.get(latest.user_id)
            return {
              ...s,
              last_modified_by: actor
                ? { id: actor.id, name: `${actor.first_name} ${actor.last_name}`, role: actor.role, at: latest.created_at }
                : { id: latest.user_id, name: "Unknown", role: "unknown", at: latest.created_at },
            }
          }
          return s
        })
      }
    } catch (err) {
      console.error("[v0] Staff API - Failed to attach last_modified_by:", err)
    }

    console.log("[v0] Staff API - Fetched page", page, "count", (enrichedStaff || []).length)
    console.log("[v0] Staff API - Response time:", Date.now() - startTime, "ms")

    return createJsonResponse({
      success: true,
      data: enrichedStaff,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
      },
      message: "Staff fetched successfully",
    })
  } catch (error) {
    console.error("[v0] Staff API - Unexpected error:", error)
    return createJsonResponse(
      {
        success: false,
        error: "Internal server error",
        data: [],
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Staff API - Starting POST request")

    let supabase, adminSupabase
    try {
      const supabaseModule = await import("@/lib/supabase/server")
      supabase = await supabaseModule.createClient()

      // Create admin client with service role key
      const { createClient } = await import("@supabase/supabase-js")
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing Supabase admin credentials")
      }

      adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })

      console.log("[v0] Staff API - Admin client created successfully")
    } catch (clientError) {
      console.error("[v0] Staff API POST - Client creation error:", clientError)
      return createJsonResponse(
        {
          success: false,
          error: "Database connection error",
        },
        500,
      )
    }

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return createJsonResponse({ success: false, error: "Authentication required" }, 401)
    }

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (!profile || (profile.role !== "admin" && profile.role !== "it-admin" && profile.role !== "regional_manager")) {
      return createJsonResponse({ success: false, error: "Admin, IT-Admin, or Regional Manageror Regional Manager access required" }, 403)
    }

    const body = await request.json()
    const { email, first_name, last_name, employee_id, department_id, position, role, assigned_location_id, password } =
      body

    if (profile.role === "it-admin") {
      const allowedForItAdmin = ["staff", "nsp", "contract", "department_head"]
      if (!allowedForItAdmin.includes(role)) {
        console.error("[v0] Staff API - IT-Admin attempted to create disallowed role:", role)
        return createJsonResponse(
          {
            success: false,
            error: "IT-Admin users cannot create this role",
            details: `IT-Admin may only create the following roles: ${allowedForItAdmin.join(", ")}`,
          },
          403,
        )
      }
    }

    if ((role === "admin" || role === "regional_manager") && profile.role !== "admin") {
      console.error("[v0] Staff API - Non-admin tried to create admin or regional_manager user")
      return createJsonResponse(
        {
          success: false,
          error: "Only administrators can create Admin or Regional Manager accounts",
          details: "You can only create: Staff, Department Head, IT-Admin, NSP, Intern, or Contract users",
        },
        403,
      )
    }

    const { data: existingAuthUser } = await adminSupabase.auth.admin.listUsers()
    const userExists = existingAuthUser.users.find((u) => u.email === email)

    if (userExists) {
      console.log("[v0] Staff API - User with email already exists:", email)
      return createJsonResponse(
        {
          success: false,
          error: "User with this email already exists",
          details: "Please use a different email address",
        },
        400,
      )
    }

    const { data: authUser, error: authCreateError } = await adminSupabase.auth.admin.createUser({
      email,
      password: password || "TempPassword123!", // Default password if not provided
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        first_name,
        last_name,
        employee_id,
      },
    })

    if (authCreateError) {
      console.error("[v0] Staff API - Auth user creation error:", authCreateError.message)
      return createJsonResponse(
        {
          success: false,
          error: "Failed to create user account",
          details: authCreateError.message,
        },
        400,
      )
    }

    console.log("[v0] Staff API - Auth user created successfully:", authUser.user.id)

    const { data: existingProfile } = await adminSupabase
      .from("user_profiles")
      .select("id")
      .eq("id", authUser.user.id)
      .single()

    let newProfile, insertError

    if (existingProfile) {
      console.log("[v0] Staff API - Updating existing profile:", authUser.user.id)
      // Update existing profile
      const { data, error } = await adminSupabase
        .from("user_profiles")
        .update({
          email,
          first_name,
          last_name,
          employee_id,
          department_id: department_id || null,
          assigned_location_id: assigned_location_id || null,
          position: position || null,
          role: role || "staff",
          is_active: true,
        })
        .eq("id", authUser.user.id)
        .select(`
          *,
          departments:department_id(id, name, code),
          geofence_locations:assigned_location_id(id, name, address)
        `)
        .single()

      newProfile = data
      insertError = error
    } else {
      console.log("[v0] Staff API - Creating new profile:", authUser.user.id)
      // Insert new profile
      const { data, error } = await adminSupabase
        .from("user_profiles")
        .insert({
          id: authUser.user.id, // Use the auth user ID
          email,
          first_name,
          last_name,
          employee_id,
          department_id: department_id || null,
          assigned_location_id: assigned_location_id || null,
          position: position || null,
          role: role || "staff",
          is_active: true,
        })
        .select(`
          *,
          departments:department_id(id, name, code),
          geofence_locations:assigned_location_id(id, name, address)
        `)
        .single()

      newProfile = data
      insertError = error
    }

    if (insertError) {
      console.error("[v0] Staff API - Profile insert/update error:", insertError)

      // Detect role enumeration constraint missing (common when adding new role values)
      if (String(insertError.message || "").toLowerCase().includes("role_check") || String(insertError.details || "").toLowerCase().includes("role_check") || String(insertError.message || "").toLowerCase().includes("audit_staff")) {
        // Clean up auth user
        await adminSupabase.auth.admin.deleteUser(authUser.user.id)
        return createJsonResponse(
          {
            success: false,
            error:
              "Database constraint prevents the 'audit_staff' role from being saved. Please add 'audit_staff' to your user_profiles role constraint or run the migration provided in the admin docs.",
            details:
              "Suggested SQL (Postgres):\nALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;\nALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin','it-admin','department_head','regional_manager','nsp','intern','contract','staff','audit_staff'));",
          },
          400,
        )
      }

      // Clean up auth user if profile creation fails
      await adminSupabase.auth.admin.deleteUser(authUser.user.id)
      return createJsonResponse(
        {
          success: false,
          error: "Failed to create staff profile",
          details: insertError.message,
        },
        400,
      )
    }

    console.log("[v0] Staff API - Staff member created successfully")

    // write an audit log for creation
    try {
      await adminSupabase.from("audit_logs").insert({
        user_id: user.id,
        action: "create_staff",
        table_name: "user_profiles",
        record_id: authUser.user.id,
        new_values: newProfile,
        ip_address: null,
        user_agent: null,
      })
    } catch (auditErr) {
      console.error("[v0] Staff API - Failed to write audit log for create_staff:", auditErr)
    }

    return createJsonResponse(
      {
        success: true,
        data: newProfile,
        message: "Staff member created successfully",
      },
      201,
    )
  } catch (error) {
    console.error("[v0] Staff API POST - Unexpected error:", error)
    return createJsonResponse(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    )
  }
}

export async function OPTIONS() {
  return createJsonResponse({ message: "Method allowed" })
}
