import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    let user
    let authError

    try {
      const authResult = await supabase.auth.getUser()
      user = authResult.data?.user
      authError = authResult.error
    } catch (error) {
      console.error("[v0] Departments API - Auth exception:", error)
      // Return empty array instead of failing when auth is unavailable
      return NextResponse.json({
        success: true,
        departments: [],
        data: [],
      })
    }

    if (authError || !user) {
      console.log("[v0] Departments API - No authenticated user")
      // Return empty array for unauthenticated requests
      return NextResponse.json({
        success: true,
        departments: [],
        data: [],
      })
    }

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (!profile || !["admin", "it-admin", "department_head", "regional_manager"].includes(profile.role)) {
      console.log("[v0] Departments API - Insufficient permissions for role:", profile?.role)
      // Return empty array for insufficient permissions
      return NextResponse.json({
        success: true,
        departments: [],
        data: [],
      })
    }

    // Get all active departments
    const { data: departments, error } = await supabase
      .from("departments")
      .select(`
        id,
        name,
        code,
        description,
        is_active,
        created_at
      `)
      .eq("is_active", true)
      .order("name")

    if (error) {
      console.error("[v0] Departments fetch error:", error)
      return NextResponse.json({
        success: true,
        departments: [],
        data: [],
      })
    }

    console.log("[v0] Departments API - Fetched", departments?.length || 0, "departments")

    return NextResponse.json({
      success: true,
      departments: departments || [],
      data: departments || [],
    })
  } catch (error) {
    console.error("[v0] Departments API error:", error)
    // Return empty array instead of error to prevent UI breakage
    return NextResponse.json({
      success: true,
      departments: [],
      data: [],
    })
  }
}
