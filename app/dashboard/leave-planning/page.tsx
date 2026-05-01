import { createClient } from "@/lib/supabase/server"
import { LeavePlanningClient } from "./leave-planning-client"

export default async function LeavePlanningPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, department_id, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  return (
    <div className="leave-theme">
      <LeavePlanningClient
        profile={{
          role: profile.role,
          firstName: (profile as any)?.first_name || "",
          lastName: (profile as any)?.last_name || "",
          departmentName: (profile as any)?.departments?.name || null,
          departmentCode: (profile as any)?.departments?.code || null,
        }}
      />
    </div>
  )
}
