import { createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"

export default async function LeaveManagementPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  let staffRequests = []
  let managerNotifications = []

  // Fetch staff's own leave requests
  if (["staff"].includes(profile.role)) {
    const { data: requests } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    staffRequests = requests || []
  }

  // Fetch pending notifications for managers
  if (["admin", "regional_manager", "department_head"].includes(profile.role)) {
    let query = supabase
      .from("leave_notifications")
      .select("*, leave_requests(*)")
      .eq("status", "pending")

    if (profile.role === "department_head") {
      // Department heads see requests from their department staff
      query = query.not("status", "eq", "dismissed")
    } else if (profile.role === "regional_manager") {
      // Regional managers see all pending requests
      query = query.not("status", "eq", "dismissed")
    }
    // Admin sees all

    const { data: notifications } = await query.order("created_at", { ascending: false })
    managerNotifications = notifications || []
  }

  return (
    <LeaveManagementModuleClient
      userRole={profile.role}
      userDepartment={profile.department_id}
      userDepartmentName={(profile as any)?.departments?.name || null}
      userDepartmentCode={(profile as any)?.departments?.code || null}
      initialStaffRequests={staffRequests}
      initialManagerNotifications={managerNotifications}
    />
  )
}
