import { AttendanceReports } from "@/components/admin/attendance-reports"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BarChart3, TrendingUp } from "lucide-react"

export default async function ReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id, assigned_location_id")
    .eq("id", user.id)
    .single()

  if (!profile || !["admin", "regional_manager", "department_head"].includes(profile.role)) {
    redirect("/dashboard")
  }

  const scopeRole = profile.role as "admin" | "regional_manager" | "department_head"
  const scopeDepartmentId = profile.department_id ?? null
  const scopeLocationId = profile.assigned_location_id ?? null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_35%),radial-gradient(circle_at_85%_10%,_rgba(236,72,153,0.12),_transparent_30%),linear-gradient(to_bottom_right,_#020617,_#0f172a,_#020617)]">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-violet-600/5 to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/6 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500/25 to-violet-600/25 rounded-2xl ring-1 ring-white/10 shadow-lg backdrop-blur-sm">
              <BarChart3 className="h-6 w-6 text-blue-300" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Reports &amp; Analytics</h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-0.5">Attendance insights, trends &amp; export tools</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 ring-1 ring-green-500/20 text-xs text-green-400 font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            Live data
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        <AttendanceReports
          scopeRole={scopeRole}
          scopeDepartmentId={scopeDepartmentId}
          scopeLocationId={scopeLocationId}
        />
      </div>
    </div>
  )
}
