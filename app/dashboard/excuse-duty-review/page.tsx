import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ExcuseDutyReviewClient } from "@/components/admin/excuse-duty-review-client"
import { isAdminRole, isDepartmentHeadRole, isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"

export default async function ExcuseDutyReviewPage() {
  const supabase = await createClient()

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/auth/login")
  }

  // Get user profile to check role
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, department_id, first_name, last_name")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    redirect("/dashboard")
  }

  const normalizedRole = normalizeAppRole(profile.role)
  const isAdmin = isAdminRole(normalizedRole)
  const isRegionalManager = isRegionalManagerRole(normalizedRole)
  const isRegionalHr = isRegionalHrRole(normalizedRole)
  const isDeptHead = isDepartmentHeadRole(normalizedRole)
  const isTransportManager = normalizedRole === "transport_manager"

  // Check if user has an authorised review role.
  if (!isAdmin && !isRegionalManager && !isRegionalHr && !isDeptHead && !isTransportManager) {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Excuse Duty Review</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Review and approve excuse duty submissions from all departments"
              : isRegionalManager || isRegionalHr
                ? "Review and approve excuse duty submissions from staff in your regional office and its district offices"
                : "Review and approve excuse duty submissions from your department"}
          </p>
        </div>

        <ExcuseDutyReviewClient userRole={profile.role} userDepartment={profile.department_id} />
      </div>
  )
}
