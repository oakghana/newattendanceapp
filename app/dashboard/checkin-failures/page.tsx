import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CheckinFailuresClient } from "@/components/admin/checkin-failures-client"

const ALLOWED_ROLES = ["admin"]

export default async function CheckinFailuresPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/dashboard")
  }

  return <CheckinFailuresClient />
}
