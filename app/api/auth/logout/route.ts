import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Log the logout action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "logout",
      table_name: "auth_sessions",
      ip_address: request.ip || null,
      user_agent: request.headers.get("user-agent"),
    })

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })

    if (signOutError) {
      console.error("Sign out error:", signOutError)
      return NextResponse.json({ error: "Failed to sign out" }, { status: 500 })
    }

    const response = NextResponse.json({ success: true })

    // Clear auth cookies
    response.cookies.set("sb-access-token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    })
    response.cookies.set("sb-refresh-token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Logout error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
