import { createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"

export const metadata = {
  title: "Leave Management",
  description: "Manage your leave requests and balance",
}

export default async function LeaveManagementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">Please log in to access Leave Management</p>
        </div>
      </div>
    )
  }

  // Fetch user profile with department info
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, employee_id, rank, department_id, departments(id, name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">Profile not found</p>
        </div>
      </div>
    )
  }

  // Fetch all public holidays for Ghana
  const { data: holidays } = await supabase
    .from("ghana_public_holidays")
    .select("holiday_date, holiday_name")
    .order("holiday_date", { ascending: true })

  return (
    <div className="leave-theme">
      <LeaveManagementModuleClient
        profile={{
          id: profile.id,
          role: profile.role,
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          employeeId: profile.employee_id || "",
          rank: profile.rank || "",
          departmentId: (profile as any)?.departments?.id || null,
          departmentName: (profile as any)?.departments?.name || null,
          departmentCode: (profile as any)?.departments?.code || null,
        }}
        initialHolidays={holidays || []}
      />
    </div>
  )
}
