import { createAdminClient, createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MdApprovalsClient } from "./md-approvals-client"
import { MdManagerLeaveApprovals, type ManagerLeaveApprovalRequest } from "@/components/leave/md-manager-leave-approvals"
import { isManagerLeaveCategory } from "@/lib/leave-memo-access"

export default async function MdApprovalsPage() {
  const supabase = await createClient()
  const { user } = await getAuthenticatedUser(supabase)

  if (!user) redirect("/auth/login")

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, profile_image_url, md_signature_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) console.error("[v0] MD Approvals Page - Profile fetch error:", profileError)
  if (!profile) redirect("/auth/login")

  const normalizedRole = String(profile.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  if (!['admin', 'administrator', 'managing_director'].includes(normalizedRole)) redirect("/dashboard/attendance")

  const admin = await createAdminClient()
  const { data: pendingManagerLeaveRows, error: managerLeaveError } = await admin
    .from("leave_plan_requests")
.select("id, user_id, status, workflow_stage, leave_type_key, staff_category, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, hr_approved_start_date, hr_approved_end_date, requested_days, adjusted_days, hr_approved_at, hr_approver_name, memo_reference")
    .in("status", ["hr_approved", "approved", "regional_manager_approved"])
    .eq("is_archived", false)
    .order("hr_approved_at", { ascending: true })
    .limit(200)

  if (managerLeaveError) console.error("[v0] MD Approvals Page - Manager leave queue error:", managerLeaveError)
  const managerLeaveUserIds = [...new Set((pendingManagerLeaveRows || []).map((row: any) => row.user_id).filter(Boolean))]
  const { data: managerLeaveProfiles } = managerLeaveUserIds.length
    ? await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, department_id, departments(name)")
        .in("id", managerLeaveUserIds)
    : { data: [] as any[] }
  const managerLeaveProfileMap = new Map((managerLeaveProfiles || []).map((row: any) => [row.id, row]))
  const managerLeaveRequests: ManagerLeaveApprovalRequest[] = (pendingManagerLeaveRows || [])
    .filter((row: any) => String(row.workflow_stage || "") !== "md_approved")
    .map((row: any) => {
      const staff = managerLeaveProfileMap.get(row.user_id) as any
      const department = Array.isArray(staff?.departments) ? staff.departments[0] : staff?.departments
      return {
        ...row,
        user: staff ? {
          first_name: staff.first_name || null,
          last_name: staff.last_name || null,
          employee_id: staff.employee_id || null,
          position: staff.position || null,
          department_name: department?.name || null,
        } : null,
      }
    })
    .filter((row) => isManagerLeaveCategory(row.staff_category, row.user?.position))

  return (
    <div className="flex flex-col gap-6">
      <MdManagerLeaveApprovals requests={managerLeaveRequests} />
      <MdApprovalsClient profile={profile} />
    </div>
  )
}
