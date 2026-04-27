import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import DeviceViolationsClient from "@/components/admin/device-violations-client"

const DeviceViolationsRoutePage = async () => {
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

  const normalizedRole = (profile?.role || "").toLowerCase().trim()

  if (!profile || normalizedRole !== "admin") {
    redirect("/dashboard")
  }

  return <DeviceViolationsClient userRole={profile.role} departmentId={profile.department_id} />
}

export default DeviceViolationsRoutePage
