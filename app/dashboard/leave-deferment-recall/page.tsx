import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import LeaveDefermentRecallClient from "./leave-deferment-recall-client"

export const metadata = {
  title: "Leave Deferral & Recall",
  description: "Manage leave deferrals and recalls",
}

export default async function LeaveDefermentRecallPage() {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect("/auth/login")
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    redirect("/dashboard")
  }

  // Check role-based access
  const allowedRoles = ["admin", "regional_manager", "department_head", "staff", "director_hr", "manager_hr", "hr_leave_office"]
  if (!allowedRoles.includes(profile.role)) {
    redirect("/dashboard")
  }

  return <LeaveDefermentRecallClient profile={profile} user={user} />
}
