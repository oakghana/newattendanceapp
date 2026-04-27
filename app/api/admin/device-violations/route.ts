import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

async function getAdminUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const normalizedRole = (profile?.role || "").toString().toLowerCase().trim()

  if (!profile || normalizedRole !== "admin") {
    return {
      supabase,
      user: null,
      error: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }),
    }
  }

  return { supabase, user, error: null }
}

/**
 * DELETE /api/admin/device-violations
 *
 * Body options:
 *   { violation_id: string }          — delete a single violation record
 *   { user_id: string }               — delete all violations for a specific user
 *   { delete_all: true }              — delete every violation record
 */
export async function DELETE(request: NextRequest) {
  try {
    const { supabase, error } = await getAdminUser()
    if (error) return error

    const body = await request.json()
    const { violation_id, user_id, delete_all } = body

    if (!violation_id && !user_id && !delete_all) {
      return NextResponse.json(
        { error: "Provide violation_id, user_id, or delete_all: true" },
        { status: 400 },
      )
    }

    let query = supabase.from("device_security_violations").delete({ count: "exact" })

    if (violation_id) {
      query = query.eq("id", violation_id)
    } else if (user_id) {
      query = query.eq("attempted_user_id", user_id)
    } else if (delete_all) {
      // Supabase requires a filter; use a truthy condition to match all rows
      query = query.neq("id", "00000000-0000-0000-0000-000000000000")
    }

    const { error: deleteError, count } = await query

    if (deleteError) {
      console.error("[device-violations DELETE] error:", deleteError)
      return NextResponse.json({ error: "Failed to delete violations" }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count ?? 0 })
  } catch (err) {
    console.error("[device-violations DELETE] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
