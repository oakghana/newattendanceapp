import { redirect } from "next/navigation"
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { CheckinFailuresClient } from "@/components/admin/checkin-failures-client"

const ALLOWED_ROLES = ["admin"]

export default async function CheckinFailuresPage() {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  let user = userData.user

  // A token refresh can race this server render. Use the local session before
  // redirecting, so an authenticated navigation never falls back to login.
  if ((userError || !user)) {
    const { data: sessionData } = await supabase.auth.getSession()
    user = sessionData.session?.user ?? null
  }

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/dashboard")
  }

  return <CheckinFailuresClient />
}
