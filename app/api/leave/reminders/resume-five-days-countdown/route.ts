import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { differenceInDays, parseISO } from "date-fns"

interface ResumptionCountdown {
  id: string
  staff_name: string
  leave_type: string
  end_date: string
  resume_date: string
  days_left: number
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check user role to determine what data to return
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")

    // HR and Leave Office staff can see all countdowns
    // Regular staff see only their own
    const isHrOrLeaveOffice = ["admin", "hr", "hr_office", "hr_officer", "hr_leave_office", "manager_hr", "director_hr"].includes(userRole)

    let query = supabase
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        leave_type_key,
        adjusted_end_date,
        preferred_end_date,
        status,
        user_profiles!leave_plan_requests_user_id_fkey (
          first_name,
          last_name
        )
      `)
      .eq("status", "hr_approved")
      .eq("is_archived", false)

    // If not HR/Leave Office, show only their own leaves
    if (!isHrOrLeaveOffice) {
      query = query.eq("user_id", user.id)
    }

    const { data: leaves, error } = await query

    if (error) throw error

    // Calculate days left and filter for 5-day window or less
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const countdowns: ResumptionCountdown[] = (leaves || [])
      .map((leave: any) => {
        const endDateStr = String(leave?.adjusted_end_date || leave?.preferred_end_date || "")
        if (!endDateStr) return null

        try {
          const endDate = parseISO(endDateStr)
          const resumeDate = new Date(endDate)
          resumeDate.setDate(resumeDate.getDate() + 1)

          const daysLeft = differenceInDays(resumeDate, today)

          // Only include leaves with 5 days or less until resumption
          if (daysLeft < 0 || daysLeft > 5) return null

          const profile = (leave as any).user_profiles ?? (leave as any)["user_profiles!leave_plan_requests_user_id_fkey"]
          const staffName = [
            String(profile?.first_name || "").trim(),
            String(profile?.last_name || "").trim(),
          ]
            .filter(Boolean)
            .join(" ") || "Staff"

          return {
            id: String(leave.id),
            staff_name: staffName,
            leave_type: String(leave.leave_type_key || "Annual Leave"),
            end_date: endDateStr,
            resume_date: resumeDate.toISOString().split("T")[0],
            days_left: Math.max(0, daysLeft),
          }
        } catch {
          return null
        }
      })
      .filter(Boolean as any)

    // Sort by days_left (ascending - critical first)
    countdowns.sort((a, b) => a.days_left - b.days_left)

    return NextResponse.json({
      success: true,
      countdowns,
      total: countdowns.length,
      role: userRole,
      isHrOrLeaveOffice,
    })
  } catch (error) {
    console.error("[leave/reminders/resume-five-days-countdown] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch resumption countdowns" },
      { status: 500 },
    )
  }
}
