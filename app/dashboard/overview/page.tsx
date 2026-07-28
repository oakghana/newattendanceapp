import { createClient } from "@/lib/supabase/server"
import { DashboardOverviewClient } from "./dashboard-overview-client"

export default async function DashboardOverviewPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  // Get profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select(`
      *,
      departments (
        name,
        code
      )
    `)
    .eq("id", user.id)
    .maybeSingle()

  // Get today's attendance
  const today = new Date().toISOString().split("T")[0]
  const { data: todayData } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", user.id)
    .gte("check_in_time", `${today}T00:00:00`)
    .lt("check_in_time", `${today}T23:59:59`)
    .maybeSingle()

  // Get monthly attendance count
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: monthCount } = await supabase
    .from("attendance_records")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("check_in_time", startOfMonth)

  // Get pending approvals if admin
  let pendingApprovals = 0
  if (profile?.role === "admin") {
    const { count } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", false)
    pendingApprovals = count || 0
  }

  // Get pending MD approvals (HR-approved loan memos awaiting MD stamp)
  let pendingMdApprovals = 0
  if (profile?.role === "managing_director" || profile?.role === "admin") {
    const { count } = await supabase
      .from("loan_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved_director")
      .is("md_approved_at", null)
    pendingMdApprovals = count || 0
  }

  return (
    <DashboardOverviewClient
      user={user}
      profile={profile}
      todayAttendance={todayData}
      monthlyAttendance={monthCount || 0}
      pendingApprovals={pendingApprovals}
      pendingMdApprovals={pendingMdApprovals}
    />
  )
}
