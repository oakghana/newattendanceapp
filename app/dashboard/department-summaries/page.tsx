import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DepartmentSummariesClient } from "@/components/admin/department-summaries-client"

export default async function DepartmentSummariesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "admin" && profile.role !== "department_head")) {
    redirect("/dashboard")
  }

  return <DepartmentSummariesClient userRole={profile.role} departmentId={profile.department_id} />
}
