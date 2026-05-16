import { LocationManagement } from "@/components/admin/location-management"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function LocationsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || !["admin", "director_hr", "manager_hr"].includes(profile.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto py-6">
      <LocationManagement />
    </div>
  )
}
