import { AttendanceReports } from "@/components/admin/attendance-reports"
import { SimpleHrReports } from "@/components/admin/simple-hr-reports"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BarChart3, TrendingUp } from "lucide-react"
import { normalizeAppRole } from "@/lib/role-capabilities"

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

  const normalizedRole = normalizeAppRole(profile?.role)
  if (!profile || !["admin", "regional_manager", "department_head", "managing_director", "regional_hr", "director_hr", "manager_hr"].includes(normalizedRole)) {
    redirect("/dashboard")
  }

  const isHrRole = normalizedRole === "regional_hr" || normalizedRole === "director_hr" || normalizedRole === "manager_hr"
  const scopeRole = normalizedRole as "admin" | "regional_manager" | "regional_hr" | "department_head"
  const scopeDepartmentId = profile.department_id ?? null
  const scopeLocationId = profile.assigned_location_id ?? null

  return (
    <div className={isHrRole ? "min-h-screen bg-background" : "min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_35%),radial-gradient(circle_at_85%_10%,_rgba(236,72,153,0.12),_transparent_30%),linear-gradient(to_bottom_right,_#020617,_#0f172a,_#020617)]"}>
      {/* Header */}
      <div className={isHrRole ? "border-b bg-card" : "relative overflow-hidden border-b border-white/5"}>
        {!isHrRole && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-violet-600/5 to-transparent pointer-events-none" />
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/6 rounded-full blur-3xl pointer-events-none" />
          </>
        )}
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 py-5 sm:py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={isHrRole ? "p-2.5 rounded-xl bg-blue-50 border" : "p-3 bg-gradient-to-br from-blue-500/25 to-violet-600/25 rounded-2xl ring-1 ring-white/10 shadow-lg backdrop-blur-sm"}>
              <BarChart3 className={isHrRole ? "h-5 w-5 text-blue-600" : "h-6 w-6 text-blue-300"} />
            </div>
            <div>
              <h1 className={isHrRole ? "text-xl font-semibold text-foreground" : "text-xl sm:text-2xl font-bold text-white tracking-tight"}>
                Reports &amp; Analytics
              </h1>
              <p className={isHrRole ? "text-muted-foreground text-xs mt-0.5" : "text-slate-300 text-xs sm:text-sm mt-0.5"}>
                {isHrRole ? "View attendance records and export reports" : "Attendance insights, trends & export tools"}
              </p>
            </div>
          </div>
          {!isHrRole && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 ring-1 ring-green-500/20 text-xs text-green-400 font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              Live data
            </div>
          )}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        {isHrRole ? (
          <SimpleHrReports
            scopeRole={scopeRole}
            scopeDepartmentId={scopeDepartmentId}
            scopeLocationId={scopeLocationId}
          />
        ) : (
          <AttendanceReports
            scopeRole={scopeRole}
            scopeDepartmentId={scopeDepartmentId}
            scopeLocationId={scopeLocationId}
          />
        )}
      </div>
    </div>
  )
}
