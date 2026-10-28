import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { HRExcuseDutyClient } from "@/components/admin/hr-excuse-duty-client"

export default async function HRExcuseDutyPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(`
      role, 
      first_name, 
      last_name,
      department_id,
      departments:departments(name, code)
    `)
    .eq("id", user.id)
    .single()

  if (!profile) {
    redirect("/dashboard")
  }

  const isAdmin = profile.role === "admin"
  const isHRDepartmentHead =
    profile.role === "department_head" &&
    profile.departments &&
    (profile.departments.name.toLowerCase().includes("hr") ||
      profile.departments.name.toLowerCase().includes("human resource"))

  if (!isAdmin && !isHRDepartmentHead) {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">HR Excuse Duty Portal</h1>
        <p className="text-muted-foreground mt-2">
          Process and archive excuse duty requests approved by department heads
        </p>
      </div>

      <HRExcuseDutyClient />
    </div>
  )
}
