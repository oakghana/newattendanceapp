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
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, employee_id, rank, department_id, departments(id, name, code)")
    .eq("id", user.id)
    .single()

  // Use mock profile data if no profile found (for testing)
  const userProfile = profile || {
    id: user.id,
    role: "staff",
    first_name: "Test",
    last_name: "User",
    employee_id: "EMP001",
    rank: "Officer",
    department_id: null,
    departments: { id: null, name: "HR Department", code: "HR" },
  }

  // Fetch all public holidays for Ghana
  const { data: holidays, error: holidaysError } = await supabase
    .from("ghana_public_holidays")
    .select("holiday_date, holiday_name")
    .order("holiday_date", { ascending: true })

  // Use mock holidays as fallback
  const initialHolidays = holidays || [
    { holiday_date: "2026-01-01", holiday_name: "New Year's Day" },
    { holiday_date: "2026-03-02", holiday_name: "Independence Day" },
    { holiday_date: "2026-12-25", holiday_name: "Christmas Day" },
  ]

  return (
    <div className="leave-theme">
      <LeaveManagementModuleClient
        profile={{
          id: userProfile.id,
          role: userProfile.role || "staff",
          firstName: userProfile.first_name || "",
          lastName: userProfile.last_name || "",
          employeeId: userProfile.employee_id || "",
          rank: userProfile.rank || "",
          departmentId: (userProfile as any)?.departments?.id || null,
          departmentName: (userProfile as any)?.departments?.name || null,
          departmentCode: (userProfile as any)?.departments?.code || null,
        }}
        initialHolidays={initialHolidays}
      />
    </div>
  )
}
