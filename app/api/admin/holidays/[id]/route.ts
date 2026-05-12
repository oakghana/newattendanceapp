import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String((profile as any).role || "").toLowerCase().trim()
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can delete holidays" },
        { status: 403 }
      )
    }

    const holidayId = params.id

    // Verify holiday exists and is custom before deleting
    const { data: holiday, error: fetchError } = await admin
      .from("ghana_public_holidays")
      .select("id, is_custom")
      .eq("id", holidayId)
      .single()

    if (fetchError || !holiday) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 })
    }

    if (!(holiday as any).is_custom) {
      return NextResponse.json(
        { error: "Cannot delete standard Ghana public holidays" },
        { status: 400 }
      )
    }

    // Delete the holiday
    const { error: deleteError } = await admin
      .from("ghana_public_holidays")
      .delete()
      .eq("id", holidayId)

    if (deleteError) {
      console.error("[v0] Error deleting holiday:", deleteError)
      return NextResponse.json({ error: "Failed to delete holiday" }, { status: 500 })
    }

    console.log("[v0] Holiday deleted:", holidayId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Error in DELETE holiday:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
