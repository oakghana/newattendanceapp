import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    if (!userId || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "admin" && profile.role !== "department_head" && profile.role !== "accounts_executive")) {
      return NextResponse.json({ error: "Unauthorized - Admin or Department Head only" }, { status: 403 })
    }

    // Fetch attendance records for the specified user
    const { data: records, error } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", userId)
      .gte("check_in_time", `${startDate}T00:00:00`)
      .lte("check_in_time", `${endDate}T23:59:59`)
      .order("check_in_time", { ascending: true })

    if (error) throw error

    // Format records
    const formattedRecords = records.map((record) => {
      const checkInTime = new Date(record.check_in_time)
      const standardTime = new Date(checkInTime)
      standardTime.setHours(8, 0, 0, 0)

      return {
        date: record.check_in_time.split("T")[0],
        checkInTime: record.check_in_time,
        checkOutTime: record.check_out_time,
        workHours: record.work_hours || 0,
        location: record.google_maps_name || record.check_in_location_name || "Unknown",
        status: record.check_out_time ? (checkInTime > standardTime ? "late" : "present") : "incomplete",
      }
    })

    return NextResponse.json({ records: formattedRecords })
  } catch (error: any) {
    console.error("Error fetching staff attendance details:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch details" }, { status: 500 })
  }
}
