import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import StaffActivation from "@/components/admin/staff-activation"

export default async function StaffActivationPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("user_profiles").select("role, is_active").eq("id", user.id).single()

  if (!profile || !["admin", "administrator"].includes(String(profile.role).toLowerCase()) || !profile.is_active) {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Staff Activation</h1>
        <p className="text-gray-600 mt-2">Review and manage staff registration requests</p>
      </div>
      <StaffActivation />
    </div>
  )
}
