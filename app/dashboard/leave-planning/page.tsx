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
    .select("id, role, department_id, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  return (
    <LeavePlanningClient
      profile={{
        role: profile.role,
        departmentName: (profile as any)?.departments?.name || null,
        departmentCode: (profile as any)?.departments?.code || null,
      }}
    />
  )
}
