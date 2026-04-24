import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Users API: Starting user fetch")
    const supabase = await createClient()
    const searchTerm = request.nextUrl.searchParams.get("search")?.trim() || ""
    const requestedLimit = parseInt(request.nextUrl.searchParams.get("limit") || "5000", 10)
    const limit = Math.min(Math.max(requestedLimit || 5000, 1), 5000)

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Users API: Authentication failed", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Users API: User authenticated", user.id)

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, is_active, first_name, last_name")
      .eq("id", user.id)
      .single()

    console.log("[v0] Users API: Profile query result:", { profile, profileError })

    if (profileError) {
      console.error("[v0] Users API: Profile fetch error:", profileError)
      return NextResponse.json(
        {
          error: "Failed to fetch user profile",
          details: profileError.message,
        },
        { status: 500 },
      )
    }

    if (!profile) {
      console.log("[v0] Users API: No profile found for user")
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    console.log("[v0] Users API: User profile:", profile)

    if (!["admin", "department_head", "it-admin"].includes(profile.role)) {
      console.log("[v0] Users API: Insufficient permissions - user role:", profile.role)
      return NextResponse.json(
        {
          error: "Insufficient permissions",
          userRole: profile.role,
          requiredRoles: ["admin", "department_head", "it-admin"],
        },
        { status: 403 },
      )
    }

    console.log("[v0] Users API: Permission check passed", profile.role)

    let usersQuery = supabase
      .from("user_profiles")
      .select(`
        id,
        first_name,
        last_name,
        email,
        employee_id,
        role,
        is_active
      `)
      .eq("is_active", true)

    if (searchTerm) {
      const pattern = `%${searchTerm.replace(/%/g, "\\%")}%`
      usersQuery = usersQuery.or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},employee_id.ilike.${pattern}`,
      )
    }

    const { data: users, error } = await usersQuery.order("first_name").range(0, limit - 1)

    if (error) {
      console.error("[v0] Users fetch error:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch users",
          details: error.message,
        },
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      )
    }

    let filteredUsers = users || []
    if (profile.role === "it-admin") {
      filteredUsers = users?.filter((u) => u.role !== "admin" && u.role !== "it-admin") || []
      console.log("[v0] Users API: IT-Admin filtering applied, showing", filteredUsers.length, "users")
    }

    console.log("[v0] Users API: Successfully fetched", filteredUsers.length, "users", { searchTerm, limit })

    return NextResponse.json(
      {
        success: true,
        users: filteredUsers,
        debug: {
          currentUser: {
            id: user.id,
            role: profile.role,
            name: `${profile.first_name} ${profile.last_name}`,
          },
          totalUsers: filteredUsers.length,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Users API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  }
}
