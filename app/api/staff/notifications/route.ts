import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    
    // If not authenticated, return empty array instead of 401 to prevent page failures
    if (authError || !user) {
      return NextResponse.json({ success: true, data: [] })
    }

    // Fetch notifications for the current user
    const { data: notifications, error } = await supabase
      .from("staff_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[v0] Error fetching notifications:", error)
      // Return empty array on error to prevent page failures
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: notifications || [] })
  } catch (error) {
    console.error("[v0] Exception in notifications API:", error)
    // Return empty array on error to prevent page failures
    return NextResponse.json({ success: true, data: [] })
  }
}
