import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Activity, Sparkles } from "lucide-react"

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || !["admin", "department_head"].includes(profile.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-emerald-500/6 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-screen-xl mx-auto px-6 py-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-emerald-500/25 to-teal-600/25 rounded-2xl ring-1 ring-white/10 shadow-lg backdrop-blur-sm">
              <Activity className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Analytics Dashboard</h1>
              <p className="text-slate-400 text-sm mt-0.5">Real-time insights and predictive workforce analytics</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 ring-1 ring-violet-500/20 text-xs text-violet-400 font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <AnalyticsDashboard />
      </div>
    </div>
  )
}
