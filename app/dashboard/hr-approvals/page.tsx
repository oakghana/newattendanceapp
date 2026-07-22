import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { HRApprovalsClient } from "./hr-approvals-client"

export default async function HRApprovalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/auth/login")
  }

  // Get user profile and check role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, departments(id, name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return redirect("/dashboard")
  }

  const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const deptName = (profile as any)?.departments?.name || null
  const deptCode = (profile as any)?.departments?.code || null

  // Check if user is HR approver or admin
  const isHrApprover =
    roleNorm === "manager_hr" ||
    (roleNorm === "hr_manager" && deptName?.toLowerCase().includes("hr")) ||
    roleNorm === "admin"

  if (!isHrApprover) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 dark:bg-slate-950">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-slate-300 mb-6">You do not have permission to access the HR Approvals section. Only HR Executives can approve leave requests.</p>
          <a href="/dashboard" className="inline-block px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Return to Dashboard
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="leave-theme">
      <HRApprovalsClient profile={{ id: user.id, role: profile.role }} />
    </div>
  )
}
