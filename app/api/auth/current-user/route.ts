import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, email, role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        role: profile.role,
        department_id: profile.department_id,
        assigned_location_id: profile.assigned_location_id,
      },
    })
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
