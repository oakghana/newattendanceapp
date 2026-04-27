import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import WeeklyDeviceSharingClient from "@/components/admin/weekly-device-sharing-client"

const WeeklyDeviceSharingRoutePage = async () => {
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

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto py-6">
      <WeeklyDeviceSharingClient userRole={profile.role} departmentId={profile.department_id} />
    </div>
  )
}

export default WeeklyDeviceSharingRoutePage
