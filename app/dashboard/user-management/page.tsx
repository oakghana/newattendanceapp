import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import UserManagementClient from "@/components/admin/user-management-client"

export default async function UserManagementPage() {
  const supabase = await createClient()

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect("/auth/login")
  }

  // Get user profile and check admin access
  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", user.id).single()

  if (!profile || !["admin", "administrator", "it-admin", "it_admin", "itadmin", "department_head"].includes(String(profile.role).toLowerCase())) {
    redirect("/dashboard")
  }

  // Fetch unified user data
  const { data: users, error: usersError } = await supabase
    .from("unified_user_management")
    .select("*")
    .order("profile_created", { ascending: false })

  // Fetch departments for user creation
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name")

  return (
    <UserManagementClient users={users || []} departments={departments || []} currentUserRole={profile.role} />
  )
}
