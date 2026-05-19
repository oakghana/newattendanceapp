import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Handle cookie setting
            }
          },
        },
      }
    )

    // Fetch HR executives (users with HR roles)
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, position, email, role")
      .in("role", ["hr_executive", "hr_manager", "hr_director", "hr_officer"])
      .eq("is_active", true)
      .order("first_name")

    if (error) {
      console.error("[v0] Error fetching HR executives:", error)
      return NextResponse.json(
        { error: "Failed to fetch HR executives" },
        { status: 500 }
      )
    }

    const executives = (data || []).map((user: any) => ({
      id: user.id,
      full_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      position: user.position || "HR Executive",
      email: user.email,
      role: user.role,
    }))

    return NextResponse.json({ executives })
  } catch (err) {
    console.error("[v0] Error in HR executives API:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
